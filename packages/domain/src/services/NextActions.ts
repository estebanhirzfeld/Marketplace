import { NegotiatingParty, OperationMilestones, OperationStatus } from '../entities/Operation';
import { TransferStepProgressStatus } from '../entities/TransferStepProgress';
import { HandoverDeadlines } from '../value-objects/HandoverDeadlines';

/*
 * La próxima acción de cada rol en una operación, calculada en un solo lugar.
 *
 * En cada estado le toca a una parte, y las demás esperan sabiendo a quién y
 * hasta cuándo. La firma es la única excepción: las dos partes firman a la vez,
 * porque ninguna necesita a la otra para hacerlo. Y hay una sola tarea que no
 * traba nada: el comprador puede declarar dónde recibir el activo mientras
 * espera a otro; se vuelve su turno recién cuando hace falta para entregar.
 *
 * Devuelve qué hacer, no cómo decirlo: los textos los arma cada pantalla.
 */

export type Role = 'buyer' | 'seller' | 'platform';

export type NextActionId =
    | 'respond_offer'
    | 'sign_contract'
    | 'register_platform_access'
    | 'declare_recipient'
    | 'declare_handover'
    | 'move_domain_to_platform'
    | 'verify_custody'
    | 'pay'
    | 'enable_payment_method'
    | 'link_payment_account'
    | 'deliver_asset'
    | 'accept_delivery'
    | 'complete_operation';

export type NextStep =
    | { kind: 'act'; id: NextActionId; blocking: boolean; deadline?: Date }
    | { kind: 'wait'; waitingOn: Role[]; deadline?: Date }
    | { kind: 'done' }
    | { kind: 'cancelled' };

export type TimelineStageKey = 'negotiation' | 'contract' | 'custody' | 'payment' | 'delivery' | 'closing';

export interface TimelineStage {
    key: TimelineStageKey;
    state: 'done' | 'current' | 'pending';
    at?: Date;
}

/** El progreso de un paso que se comprueba solo, como lo guarda la fase 20. */
export interface StepProgressFact {
    stepKey: string;
    status: TransferStepProgressStatus;
    deadlineAt?: Date;
}

export interface PaymentAvailability {
    mercadopago: { available: boolean; reason?: string };
    transfer: { available: boolean };
}

export interface NextActionsInput {
    status: OperationStatus;
    assetType: string;
    pendingResponseFrom?: NegotiatingParty;
    /** El tripartito: si existe y quién ya lo firmó. */
    contract: { exists: boolean; signedBy: { buyer: boolean; seller: boolean } };
    /** Si el activo ya se puede firmar. Un sitio lo comprueba al firmar; un canal, con su acceso. */
    signReady: boolean;
    /** Desde cuándo un canal con acceso registrado se puede firmar. */
    platformAccessFrom?: Date;
    recipientDeclared: boolean;
    progress: StepProgressFact[];
    milestones: OperationMilestones;
    /** Los medios de pago, con el activo en custodia. */
    payment?: PaymentAvailability;
    completedAt?: Date;
    deadlines: HandoverDeadlines;
}

export interface NextActionsResult {
    byRole: Record<Role, NextStep>;
    /** Quién traba la operación ahora. Vacío si todos esperan un plazo o nada queda. */
    turn: Role[];
    timeline: TimelineStage[];
}

const DOMAIN_TO_PLATFORM = 'domain-to-platform';
const DOMAIN_TO_BUYER = 'domain-to-buyer';

function act(id: NextActionId, deadline?: Date, blocking = true): NextStep {
    return deadline ? { kind: 'act', id, blocking, deadline } : { kind: 'act', id, blocking };
}

function wait(waitingOn: Role[], deadline?: Date): NextStep {
    return deadline ? { kind: 'wait', waitingOn, deadline } : { kind: 'wait', waitingOn };
}

/** Un turno de una sola parte: actúa ella y las demás la esperan. */
function turnOf(role: Role, step: NextStep, waitDeadline?: Date): Record<Role, NextStep> {
    const others = wait([role], waitDeadline);
    return { buyer: others, seller: others, platform: others, [role]: step } as Record<Role, NextStep>;
}

/**
 * Mientras espera a otro, el comprador que todavía no dijo dónde recibir tiene
 * esa tarea, que no traba nada.
 */
function withRecipientTask(byRole: Record<Role, NextStep>, input: NextActionsInput): Record<Role, NextStep> {
    if (input.recipientDeclared || byRole.buyer.kind !== 'wait') return byRole;
    return { ...byRole, buyer: act('declare_recipient', undefined, false) };
}

function progressOf(input: NextActionsInput, key: string): StepProgressFact | undefined {
    return input.progress.find((p) => p.stepKey === key);
}

function stepsByRole(input: NextActionsInput): Record<Role, NextStep> {
    const { status } = input;
    const isWeb = input.assetType === 'web';

    switch (status) {
        case 'offer_sent':
        case 'negotiating': {
            const party: NegotiatingParty = input.pendingResponseFrom ?? 'seller';
            return turnOf(party, act('respond_offer'));
        }

        case 'contract_pending': {
            if (!input.contract.exists) {
                const all = wait(['platform']);
                return { buyer: all, seller: all, platform: all };
            }
            if (!input.signReady) {
                // Un canal: sin acceso registrado le toca a la plataforma; con el
                // acceso, todos esperan los siete días de YouTube.
                if (!input.platformAccessFrom) return turnOf('platform', act('register_platform_access'));
                const all = wait(['platform'], input.platformAccessFrom);
                return { buyer: all, seller: all, platform: all };
            }
            const pending: Role[] = (['buyer', 'seller'] as const).filter((p) => !input.contract.signedBy[p]);
            const stepFor = (party: 'buyer' | 'seller'): NextStep =>
                pending.includes(party) ? act('sign_contract') : wait(pending);
            return { buyer: stepFor('buyer'), seller: stepFor('seller'), platform: wait(pending) };
        }

        case 'contract_signed': {
            const deadline = input.milestones.signedAt ? input.deadlines.sellerHandover(input.milestones.signedAt) : undefined;
            return turnOf('seller', act('declare_handover', deadline), deadline);
        }

        case 'transfer_in_progress': {
            const domain = progressOf(input, DOMAIN_TO_PLATFORM);
            if (isWeb && domain?.status !== 'done') {
                return turnOf('seller', act('move_domain_to_platform', domain?.deadlineAt), domain?.deadlineAt);
            }
            return turnOf('platform', act('verify_custody'));
        }

        case 'asset_in_custody': {
            const payment = input.payment;
            const anyAvailable = !!payment && (payment.mercadopago.available || payment.transfer.available);
            if (!anyAvailable) {
                // Si lo único que falta es la cuenta del vendedor, le toca a él.
                if (payment?.mercadopago.reason === 'seller_not_linked') {
                    return turnOf('seller', act('link_payment_account'));
                }
                return turnOf('platform', act('enable_payment_method'));
            }
            const deadline = input.milestones.custodyAt ? input.deadlines.buyerPayment(input.milestones.custodyAt) : undefined;
            return turnOf('buyer', act('pay', deadline), deadline);
        }

        case 'payment_received': {
            if (!input.recipientDeclared) return turnOf('buyer', act('declare_recipient'));
            if (!isWeb) return turnOf('platform', act('deliver_asset'));
            const domain = progressOf(input, DOMAIN_TO_BUYER);
            if (domain?.status === 'done') return turnOf('platform', act('complete_operation'));
            if (domain?.status === 'waiting') {
                return turnOf('buyer', act('accept_delivery', domain.deadlineAt), domain.deadlineAt);
            }
            return turnOf('platform', act('deliver_asset'));
        }

        case 'completed': {
            const done: NextStep = { kind: 'done' };
            return { buyer: done, seller: done, platform: done };
        }

        case 'cancelled': {
            const cancelled: NextStep = { kind: 'cancelled' };
            return { buyer: cancelled, seller: cancelled, platform: cancelled };
        }
    }
}

const CURRENT_STAGE: Record<OperationStatus, TimelineStageKey | undefined> = {
    offer_sent: 'negotiation',
    negotiating: 'negotiation',
    contract_pending: 'contract',
    contract_signed: 'custody',
    transfer_in_progress: 'custody',
    asset_in_custody: 'payment',
    payment_received: 'delivery',
    completed: undefined,
    cancelled: undefined,
};

const STAGES: readonly TimelineStageKey[] = ['negotiation', 'contract', 'custody', 'payment', 'delivery', 'closing'];

function timelineOf(input: NextActionsInput): TimelineStage[] {
    const dates: Partial<Record<TimelineStageKey, Date>> = {
        contract: input.milestones.signedAt,
        custody: input.milestones.custodyAt,
        payment: input.milestones.paidAt,
        delivery: input.milestones.deliveredAt,
        closing: input.completedAt,
    };
    const current = CURRENT_STAGE[input.status];
    const currentIndex = current ? STAGES.indexOf(current) : -1;

    return STAGES.map((key, i) => {
        let state: TimelineStage['state'];
        if (input.status === 'completed') state = 'done';
        else if (input.status === 'cancelled') state = key === 'negotiation' || dates[key] ? 'done' : 'pending';
        else state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'pending';
        const at = state === 'done' ? dates[key] : undefined;
        return at ? { key, state, at } : { key, state };
    });
}

export function nextActions(input: NextActionsInput): NextActionsResult {
    const byRole = withRecipientTask(stepsByRole(input), input);
    const turn = (['buyer', 'seller', 'platform'] as const).filter((r) => {
        const step = byRole[r];
        return step.kind === 'act' && step.blocking;
    });
    return { byRole, turn, timeline: timelineOf(input) };
}
