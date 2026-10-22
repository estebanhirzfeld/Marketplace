import { describe, it, expect } from 'vitest';
import { nextActions, NextActionsInput, Role } from '../src/services/NextActions';
import { OperationStatus } from '../src/entities/Operation';
import { BusinessCalendar, DEFAULT_HANDOVER_DEADLINES, HandoverDeadlines } from '../src/value-objects/HandoverDeadlines';

/**
 * Una sola próxima acción por rol, calculada en un solo lugar. En cada estado
 * le toca a una parte —o a las dos a la vez solo para firmar— y las demás
 * esperan sabiendo a quién y hasta cuándo. La única tarea que no traba nada es
 * la del comprador que declara dónde recibir mientras espera a otro.
 */

const deadlines = new HandoverDeadlines(DEFAULT_HANDOVER_DEADLINES, new BusinessCalendar([]));
const SIGNED = new Date('2026-10-21T12:00:00Z');
const CUSTODY = new Date('2026-10-23T15:00:00-03:00');
const PAID = new Date('2026-10-28T12:00:00Z');

function input(over: Partial<NextActionsInput>): NextActionsInput {
    return {
        status: 'offer_sent',
        assetType: 'web',
        pendingResponseFrom: 'seller',
        contract: { exists: true, signedBy: { buyer: false, seller: false } },
        signReady: true,
        recipientDeclared: false,
        progress: [],
        milestones: {},
        payment: { mercadopago: { available: true }, transfer: { available: true } },
        deadlines,
        ...over,
    };
}

const ROLES: readonly Role[] = ['buyer', 'seller', 'platform'];

describe('NextActions — una parte por vez', () => {
    const STATUSES: OperationStatus[] = [
        'offer_sent',
        'negotiating',
        'contract_pending',
        'contract_signed',
        'transfer_in_progress',
        'asset_in_custody',
        'payment_received',
        'completed',
        'cancelled',
    ];

    it.each(STATUSES.flatMap((s) => (['web', 'youtube'] as const).map((t) => [s, t] as const)))(
        '%s de un %s: a lo sumo un rol traba, salvo las dos partes al firmar',
        (status, assetType) => {
            const { byRole, turn } = nextActions(input({ status, assetType, milestones: { signedAt: SIGNED, custodyAt: CUSTODY, paidAt: PAID } }));

            const blocking = ROLES.filter((r) => byRole[r].kind === 'act' && byRole[r].blocking);
            expect(blocking).toEqual(turn);
            if (status === 'contract_pending') {
                expect(turn.every((r) => r !== 'platform')).toBe(true);
            } else if (status === 'asset_in_custody') {
                // Cada comprobante es independiente; sin comprobantes, le toca a una sola parte.
                expect(turn.length).toBeLessThanOrEqual(1);
            } else {
                expect(turn.length).toBeLessThanOrEqual(1);
            }
            // Quien no traba, espera a quien traba (o tiene la tarea que no traba nada).
            for (const r of ROLES) {
                const step = byRole[r];
                if (step.kind === 'wait') expect(step.waitingOn.length).toBeGreaterThan(0);
            }
        },
    );
});

describe('NextActions — negociación', () => {
    it('le toca a quien tiene que responder; los demás esperan a esa parte', () => {
        const { byRole, turn } = nextActions(input({ status: 'negotiating', pendingResponseFrom: 'buyer' }));

        expect(turn).toEqual(['buyer']);
        expect(byRole.buyer).toMatchObject({ kind: 'act', id: 'respond_offer' });
        expect(byRole.seller).toMatchObject({ kind: 'wait', waitingOn: ['buyer'] });
        expect(byRole.platform).toMatchObject({ kind: 'wait', waitingOn: ['buyer'] });
    });

    it('sin acuerdo todavía, al comprador que espera no se le pide dónde recibir', () => {
        const { byRole } = nextActions(input({ status: 'negotiating', pendingResponseFrom: 'seller' }));

        expect(byRole.buyer).toEqual({ kind: 'wait', waitingOn: ['seller'] });
    });
});

describe('NextActions — firma', () => {
    it('las dos partes firman a la vez; la que ya firmó espera a la otra', () => {
        const { byRole, turn } = nextActions(
            input({ status: 'contract_pending', recipientDeclared: true, contract: { exists: true, signedBy: { buyer: true, seller: false } } }),
        );

        expect(turn).toEqual(['seller']);
        expect(byRole.seller).toMatchObject({ kind: 'act', id: 'sign_contract' });
        expect(byRole.buyer).toMatchObject({ kind: 'wait', waitingOn: ['seller'] });
    });

    it('con ninguna firma, firman las dos', () => {
        const { turn } = nextActions(input({ status: 'contract_pending' }));

        expect(turn).toEqual(['buyer', 'seller']);
    });

    it('un canal sin acceso registrado espera a la plataforma, que tiene que registrarlo', () => {
        const { byRole, turn } = nextActions(input({ status: 'contract_pending', assetType: 'youtube', signReady: false, recipientDeclared: true }));

        expect(turn).toEqual(['platform']);
        expect(byRole.platform).toMatchObject({ kind: 'act', id: 'register_platform_access' });
        expect(byRole.buyer).toMatchObject({ kind: 'wait', waitingOn: ['platform'] });
    });

    it('un canal dentro de su espera de siete días: todos esperan, con la fecha', () => {
        const from = new Date('2026-10-25T12:00:00Z');
        const { byRole, turn } = nextActions(
            input({ status: 'contract_pending', assetType: 'youtube', signReady: false, platformAccessFrom: from }),
        );

        expect(turn).toEqual([]);
        expect(byRole.seller).toMatchObject({ kind: 'wait', waitingOn: ['platform'], deadline: from });
        expect(byRole.platform).toMatchObject({ kind: 'wait', deadline: from });
    });

    it('sin contrato todavía, todos esperan a la plataforma', () => {
        const { byRole, turn } = nextActions(
            input({ status: 'contract_pending', recipientDeclared: true, contract: { exists: false, signedBy: { buyer: false, seller: false } } }),
        );

        expect(turn).toEqual([]);
        expect(byRole.buyer).toMatchObject({ kind: 'wait', waitingOn: ['platform'] });
    });
});

describe('NextActions — cesión y custodia', () => {
    it('con el contrato firmado le toca al vendedor, con su plazo; el comprador puede declarar dónde recibir', () => {
        const { byRole, turn } = nextActions(input({ status: 'contract_signed', milestones: { signedAt: SIGNED } }));

        expect(turn).toEqual(['seller']);
        expect(byRole.seller).toMatchObject({ kind: 'act', id: 'declare_handover', deadline: deadlines.sellerHandover(SIGNED) });
        expect(byRole.buyer).toMatchObject({ kind: 'act', id: 'declare_recipient', blocking: false });
        expect(byRole.platform).toMatchObject({ kind: 'wait', waitingOn: ['seller'] });
    });

    it('con la cuenta ya declarada, el comprador espera al vendedor', () => {
        const { byRole } = nextActions(input({ status: 'contract_signed', recipientDeclared: true }));

        expect(byRole.buyer).toMatchObject({ kind: 'wait', waitingOn: ['seller'] });
    });

    it('en un sitio, mientras el dominio no llega a nuestra cuenta, le toca al vendedor moverlo', () => {
        const deadline = new Date('2026-10-30T09:00:00Z');
        const { byRole, turn } = nextActions(
            input({
                status: 'transfer_in_progress',
                progress: [{ stepKey: 'domain-to-platform', status: 'waiting', deadlineAt: deadline }],
            }),
        );

        expect(turn).toEqual(['seller']);
        expect(byRole.seller).toMatchObject({ kind: 'act', id: 'move_domain_to_platform', deadline });
        expect(byRole.platform).toMatchObject({ kind: 'wait', waitingOn: ['seller'] });
    });

    it('en un sitio, con el dominio en nuestra cuenta, le toca a la plataforma confirmar la custodia', () => {
        const { byRole, turn } = nextActions(
            input({ status: 'transfer_in_progress', progress: [{ stepKey: 'domain-to-platform', status: 'done' }] }),
        );

        expect(turn).toEqual(['platform']);
        expect(byRole.platform).toMatchObject({ kind: 'act', id: 'verify_custody' });
        expect(byRole.seller).toMatchObject({ kind: 'wait', waitingOn: ['platform'] });
    });

    it('en un canal, la plataforma verifica la custodia', () => {
        const { byRole, turn } = nextActions(input({ status: 'transfer_in_progress', assetType: 'youtube' }));

        expect(turn).toEqual(['platform']);
        expect(byRole.platform).toMatchObject({ kind: 'act', id: 'verify_custody' });
    });
});

describe('NextActions — pago', () => {
    it('con un medio disponible le toca al comprador, con sus días hábiles', () => {
        const { byRole, turn } = nextActions(input({ status: 'asset_in_custody', milestones: { custodyAt: CUSTODY } }));

        expect(turn).toEqual(['buyer']);
        expect(byRole.buyer).toMatchObject({ kind: 'act', id: 'pay', deadline: deadlines.buyerPayment(CUSTODY) });
        expect(byRole.seller).toMatchObject({ kind: 'wait', waitingOn: ['buyer'] });
    });

    it('sin ningún medio, le toca a la plataforma habilitar uno y el comprador no tiene plazo', () => {
        const { byRole, turn } = nextActions(
            input({
                status: 'asset_in_custody',
                recipientDeclared: true,
                milestones: { custodyAt: CUSTODY },
                payment: { mercadopago: { available: false, reason: 'not_configured' }, transfer: { available: false } },
            }),
        );

        expect(turn).toEqual(['platform']);
        expect(byRole.platform).toMatchObject({ kind: 'act', id: 'enable_payment_method' });
        expect(byRole.buyer).toEqual({ kind: 'wait', waitingOn: ['platform'] });
    });

    it('si el único medio pide la cuenta de Mercado Pago del vendedor, le toca al vendedor vincularla', () => {
        const { byRole, turn } = nextActions(
            input({
                status: 'asset_in_custody',
                recipientDeclared: true,
                payment: { mercadopago: { available: false, reason: 'seller_not_linked' }, transfer: { available: false } },
            }),
        );

        expect(turn).toEqual(['seller']);
        expect(byRole.seller).toMatchObject({ kind: 'act', id: 'link_payment_account' });
        expect(byRole.buyer).toMatchObject({ kind: 'wait', waitingOn: ['seller'] });
    });

    it('si a la transferencia le falta la cuenta del vendedor, le toca al vendedor decir dónde cobrar', () => {
        const { byRole, turn } = nextActions(
            input({
                status: 'asset_in_custody',
                recipientDeclared: true,
                payment: { mercadopago: { available: false, reason: 'not_configured' }, transfer: { available: false, reason: 'seller_bank_missing' } },
            }),
        );

        expect(turn).toEqual(['seller']);
        expect(byRole.seller).toMatchObject({ kind: 'act', id: 'link_payment_account' });
    });
});

/*
 * Con la transferencia dividida, cada comprobante es independiente: el
 * vendedor confirma el suyo, la plataforma la comisión y el comprador corrige
 * el que le rechacen, a la vez y sin esperarse.
 */
describe('NextActions — comprobantes de la transferencia', () => {
    const UPLOADED = new Date('2026-10-22T10:00:00-03:00');
    const enCustodia = (receipts: NextActionsInput['receipts']) =>
        nextActions(input({ status: 'asset_in_custody', recipientDeclared: true, milestones: { custodyAt: CUSTODY }, receipts }));

    it('con los dos subidos, el vendedor confirma el suyo, con su plazo, y la plataforma la comisión', () => {
        const { byRole, turn } = enCustodia({ seller: 'pending', platform: 'pending', sellerUploadedAt: UPLOADED });

        expect(turn).toEqual(['seller', 'platform']);
        expect(byRole.seller).toMatchObject({
            kind: 'act',
            id: 'confirm_seller_receipt',
            deadline: deadlines.sellerTransferConfirmation(UPLOADED),
        });
        expect(byRole.platform).toMatchObject({ kind: 'act', id: 'confirm_commission_receipt' });
        expect(byRole.buyer).toEqual({ kind: 'wait', waitingOn: ['seller', 'platform'] });
    });

    it('con uno rechazado, el comprador lo vuelve a subir mientras el otro se confirma', () => {
        const { byRole, turn } = enCustodia({ seller: 'rejected', platform: 'pending' });

        expect(turn).toEqual(['buyer', 'platform']);
        expect(byRole.buyer).toMatchObject({ kind: 'act', id: 'pay' });
        // El vendedor espera primero al comprador, que es lo que destraba su parte.
        expect(byRole.seller).toEqual({ kind: 'wait', waitingOn: ['buyer', 'platform'] });
    });

    it('con uno solo subido, al comprador le falta el otro', () => {
        const { byRole, turn } = enCustodia({ platform: 'confirmed' });

        expect(turn).toEqual(['buyer']);
        expect(byRole.buyer).toMatchObject({ kind: 'act', id: 'pay' });
    });
});

describe('NextActions — revisión de un comprobante', () => {
    const DEADLINE = new Date('2026-10-26T23:59:59-03:00');
    const enCustodia = (receipts: NextActionsInput['receipts']) =>
        nextActions(input({ status: 'asset_in_custody', recipientDeclared: true, milestones: { custodyAt: CUSTODY }, receipts }));

    it('pedida la revisión, la plataforma revisa la coherencia y las partes la esperan', () => {
        const { byRole, turn } = enCustodia({
            seller: 'in_review',
            platform: 'confirmed',
            review: { recipient: 'seller', stage: 'coherence', hasSellerStatement: false },
        });

        expect(turn).toEqual(['platform']);
        expect(byRole.platform).toMatchObject({ kind: 'act', id: 'review_receipt', blocking: true });
        expect(byRole.buyer).toEqual({ kind: 'wait', waitingOn: ['platform'] });
        expect(byRole.seller).toEqual({ kind: 'wait', waitingOn: ['platform'] });
    });

    it('con el comprobante coherente, el vendedor responde con su plazo y la plataforma puede resolver', () => {
        const { byRole, turn } = enCustodia({
            seller: 'in_review',
            platform: 'confirmed',
            review: { recipient: 'seller', stage: 'awaiting_seller', sellerDeadline: DEADLINE, hasSellerStatement: false },
        });

        expect(turn).toEqual(['seller']);
        expect(byRole.seller).toEqual({ kind: 'act', id: 'respond_receipt_review', blocking: true, deadline: DEADLINE });
        expect(byRole.platform).toMatchObject({ kind: 'act', id: 'resolve_receipt_review', blocking: false });
        expect(byRole.buyer).toEqual({ kind: 'wait', waitingOn: ['seller'], deadline: DEADLINE });
    });

    it('con los movimientos del vendedor, decide la plataforma', () => {
        const { byRole, turn } = enCustodia({
            seller: 'in_review',
            platform: 'confirmed',
            review: { recipient: 'seller', stage: 'awaiting_seller', sellerDeadline: DEADLINE, hasSellerStatement: true },
        });

        expect(turn).toEqual(['platform']);
        expect(byRole.platform).toMatchObject({ kind: 'act', id: 'resolve_receipt_review', blocking: true });
        expect(byRole.seller).toEqual({ kind: 'wait', waitingOn: ['platform'] });
    });

    it('la revisión de un comprobante no tapa al otro: el vendedor confirma el suyo mientras se revisa la comisión', () => {
        const { byRole, turn } = enCustodia({
            seller: 'pending',
            platform: 'in_review',
            sellerUploadedAt: CUSTODY,
            review: { recipient: 'platform', stage: 'coherence', hasSellerStatement: false },
        });

        expect(turn).toEqual(['seller', 'platform']);
        expect(byRole.seller).toMatchObject({ kind: 'act', id: 'confirm_seller_receipt' });
        expect(byRole.platform).toMatchObject({ kind: 'act', id: 'review_receipt' });
    });

    it('con el del vendedor en revisión y la comisión sin enviar, el comprador transfiere la comisión', () => {
        const { byRole } = enCustodia({
            seller: 'in_review',
            review: { recipient: 'seller', stage: 'coherence', hasSellerStatement: false },
        });

        expect(byRole.buyer).toMatchObject({ kind: 'act', id: 'pay' });
        expect(byRole.platform).toMatchObject({ kind: 'act', id: 'review_receipt' });
    });

    it('la revisión de la comisión la resuelve la plataforma sola', () => {
        const { byRole, turn } = enCustodia({
            seller: 'confirmed',
            platform: 'in_review',
            review: { recipient: 'platform', stage: 'awaiting_seller', sellerDeadline: DEADLINE, hasSellerStatement: false },
        });

        expect(turn).toEqual(['platform']);
        expect(byRole.platform).toMatchObject({ kind: 'act', id: 'resolve_receipt_review', blocking: true });
        expect(byRole.seller).toEqual({ kind: 'wait', waitingOn: ['platform'] });
    });
});

describe('NextActions — entrega y cierre', () => {
    it('un sitio pagado sin cuenta receptora espera al comprador, que ahora sí la tiene que declarar', () => {
        const { byRole, turn } = nextActions(input({ status: 'payment_received' }));

        expect(turn).toEqual(['buyer']);
        expect(byRole.buyer).toMatchObject({ kind: 'act', id: 'declare_recipient', blocking: true });
    });

    it('un sitio pagado con la cuenta declarada: la plataforma inicia la entrega del dominio', () => {
        const { byRole, turn } = nextActions(input({ status: 'payment_received', recipientDeclared: true }));

        expect(turn).toEqual(['platform']);
        expect(byRole.platform).toMatchObject({ kind: 'act', id: 'deliver_asset' });
    });

    it('con la invitación del dominio enviada, le toca al comprador aceptarla en Hostinger', () => {
        const deadline = new Date('2026-11-04T12:00:00Z');
        const { byRole, turn } = nextActions(
            input({
                status: 'payment_received',
                recipientDeclared: true,
                progress: [{ stepKey: 'domain-to-buyer', status: 'waiting', deadlineAt: deadline }],
            }),
        );

        expect(turn).toEqual(['buyer']);
        expect(byRole.buyer).toMatchObject({ kind: 'act', id: 'accept_delivery', deadline });
    });

    it('con el dominio entregado, la plataforma cierra', () => {
        const { byRole, turn } = nextActions(
            input({
                status: 'payment_received',
                recipientDeclared: true,
                progress: [{ stepKey: 'domain-to-buyer', status: 'done' }],
            }),
        );

        expect(turn).toEqual(['platform']);
        expect(byRole.platform).toMatchObject({ kind: 'act', id: 'complete_operation' });
    });

    it('un canal pagado: la plataforma entrega', () => {
        const { byRole, turn } = nextActions(input({ status: 'payment_received', assetType: 'youtube', recipientDeclared: true }));

        expect(turn).toEqual(['platform']);
        expect(byRole.platform).toMatchObject({ kind: 'act', id: 'deliver_asset' });
    });

    it('cerrada o cancelada, nadie tiene nada que hacer', () => {
        expect(nextActions(input({ status: 'completed' })).turn).toEqual([]);
        expect(nextActions(input({ status: 'completed' })).byRole.buyer).toEqual({ kind: 'done' });
        expect(nextActions(input({ status: 'cancelled' })).byRole.seller).toEqual({ kind: 'cancelled' });
    });
});

describe('NextActions — línea de tiempo', () => {
    it('es la misma para los tres roles y marca hecho, en curso y pendiente, con las fechas', () => {
        const { timeline } = nextActions(
            input({ status: 'asset_in_custody', milestones: { signedAt: SIGNED, custodyAt: CUSTODY } }),
        );

        expect(timeline).toEqual([
            { key: 'negotiation', state: 'done' },
            { key: 'contract', state: 'done', at: SIGNED },
            { key: 'custody', state: 'done', at: CUSTODY },
            { key: 'payment', state: 'current' },
            { key: 'delivery', state: 'pending' },
            { key: 'closing', state: 'pending' },
        ]);
    });

    it('cerrada, todo hecho', () => {
        const { timeline } = nextActions(input({ status: 'completed', completedAt: PAID }));

        expect(timeline.every((s) => s.state === 'done')).toBe(true);
        expect(timeline.at(-1)).toEqual({ key: 'closing', state: 'done', at: PAID });
    });
});
