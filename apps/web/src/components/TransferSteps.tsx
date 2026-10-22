import type { HandoverStepDto, OperationStatusDto, StepProgressDto } from '@marketplace/api-contract';
import { OperationAction } from './OperationAction';
import { Alert, Panel } from './ui';
import { fechaLarga } from '@/lib/format';

/*
 * El traspaso de un sitio, paso a paso.
 *
 * El progreso de cada paso lo guarda la API (`stepProgress`): el traslado del
 * dominio lo comprueba Hostinger, los pasos declarados los da por cumplidos un
 * admin. Un paso sin progreso está pendiente y sin plazo.
 */

type ActionState = { error?: string; ok?: boolean; message?: string };
type Action = (state: ActionState) => Promise<ActionState>;

const DOMAIN_TO_BUYER = 'domain-to-buyer';

const ESTADO: Record<StepProgressDto['status'] | 'pending', { text: string; clase: string }> = {
    pending: { text: 'PENDIENTE', clase: 'text-[var(--color-tenue)] border-[var(--color-borde-fuerte)]' },
    waiting: { text: 'EN CURSO', clase: 'text-[var(--color-tinta)] border-[var(--color-borde-fuerte)]' },
    done: { text: 'LISTO', clase: 'text-[var(--color-acento)] border-[var(--color-acento)]/50' },
    expired: { text: 'VENCIDO', clase: 'text-[var(--color-alerta)] border-[var(--color-alerta)]/50' },
    rejected: { text: 'RECHAZADO', clase: 'text-[var(--color-error)] border-[var(--color-error)]/50' },
};

function progressOf(progress: StepProgressDto[], key?: string): StepProgressDto | undefined {
    return key ? progress.find((p) => p.stepKey === key) : undefined;
}

/** Lo que se dice debajo del paso: hasta cuándo, cuándo venció, quién lo dio por cumplido. */
function noteFor(progress?: StepProgressDto): string | undefined {
    if (!progress) return undefined;
    if (progress.status === 'expired' && progress.deadlineAt) return `Venció el ${fechaLarga(progress.deadlineAt)}.`;
    if ((progress.status === 'waiting' || progress.status === 'pending') && progress.deadlineAt) {
        return `Vence el ${fechaLarga(progress.deadlineAt)}.`;
    }
    if (progress.status === 'done' && progress.attested) return 'Lo comprobó la plataforma.';
    return undefined;
}

/** Los pasos del traspaso con su estado y su plazo. Para el vendedor y el admin. */
export function TransferStepsList({ steps, progress }: { steps: HandoverStepDto[]; progress: StepProgressDto[] }) {
    if (steps.length === 0) return null;

    return (
        <ol className="flex flex-col divide-y divide-[var(--color-borde)]">
            {steps.map((step) => {
                const p = progressOf(progress, step.key);
                const estado = ESTADO[p?.status ?? 'pending'];
                const note = noteFor(p);
                return (
                    <li key={step.key ?? step.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                        <div className="flex flex-col gap-1">
                            <span className="text-[14px]">{step.title ?? step.description}</span>
                            {note && <span className="text-[12px] text-[var(--color-tenue)]">{note}</span>}
                        </div>
                        <span
                            className={`shrink-0 rounded-[var(--radius-chico)] border px-2 py-0.5 font-mono text-[11px] tracking-[0.08em] ${estado.clase}`}
                        >
                            {estado.text}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

/** Lo único que el comprador tiene que saber de la entrega: si le toca aceptar y hasta cuándo. */
export function DomainDeliveryStatus({
    recipient,
    progress,
    completed = false,
}: {
    recipient: string;
    progress?: StepProgressDto;
    /**
     * La operación ya se cerró. Cerrarla exige que el comprador sea dueño, así
     * que el dominio ya es suyo aunque no haya quedado una fila de la entrega
     * (por ejemplo, si se cerró antes de que hubiera registrador).
     */
    completed?: boolean;
}) {
    if (completed || progress?.status === 'done') {
        return <Alert tono="listo">El dominio ya está en tu cuenta de Hostinger.</Alert>;
    }
    if (progress?.status === 'rejected') {
        return (
            <Alert tono="error">No pudimos completar la entrega del dominio. Te vamos a contactar para resolverlo.</Alert>
        );
    }
    if (progress?.status === 'expired') {
        return <Alert tono="alerta">La invitación venció sin aceptarse. Te vamos a mandar una nueva.</Alert>;
    }
    if (progress?.status === 'waiting') {
        return (
            <Alert tono="alerta">
                Te mandamos la invitación a {recipient}. Aceptala desde tu cuenta de Hostinger
                {progress.deadlineAt ? ` antes del ${fechaLarga(progress.deadlineAt)}` : ''}.
            </Alert>
        );
    }
    return (
        <p className="text-[13px] leading-relaxed text-[var(--color-tenue)]">
            Vamos a trasladarte el dominio a la cuenta de Hostinger de {recipient}.
        </p>
    );
}

/** Mientras dura la entrega se pueden dar por cumplidos los pasos declarados. */
const ATTESTABLE: OperationStatusDto[] = ['transfer_in_progress', 'asset_in_custody', 'payment_received'];

/**
 * Lo que el admin puede hacer sobre el traspaso de un sitio, según el estado:
 * comprobar el dominio, dar por cumplidos los pasos declarados, iniciar y
 * comprobar la entrega.
 */
export function AdminDomainTransferPanel({
    status,
    steps,
    progress,
    actions,
}: {
    status: OperationStatusDto;
    steps: HandoverStepDto[];
    progress: StepProgressDto[];
    actions: {
        checkCustody: Action;
        attest: (stepKey: string) => Action;
        deliver: Action;
        checkDelivery: Action;
    };
}) {
    const declaredPending = ATTESTABLE.includes(status)
        ? steps.filter((s) => s.check === 'declared' && s.key && progressOf(progress, s.key)?.status !== 'done')
        : [];
    const delivery = progressOf(progress, DOMAIN_TO_BUYER);
    const deliveryOpen = delivery?.status === 'waiting' || delivery?.status === 'pending';

    const items: React.ReactNode[] = [];
    if (status === 'transfer_in_progress') {
        items.push(
            <OperationAction key="custody" action={actions.checkCustody} text="Comprobar el dominio en Hostinger" variant="secundario" />,
        );
    }
    for (const step of declaredPending) {
        items.push(
            <OperationAction
                key={step.key}
                action={actions.attest(step.key!)}
                text={`Dar por cumplido: ${step.title ?? step.description}`}
                variant="secundario"
            />,
        );
    }
    if (status === 'payment_received') {
        items.push(
            deliveryOpen ? (
                <OperationAction key="delivery" action={actions.checkDelivery} text="Comprobar la entrega" variant="secundario" />
            ) : delivery?.status === 'done' ? null : (
                <OperationAction
                    key="delivery"
                    action={actions.deliver}
                    text={delivery?.status === 'expired' ? 'Iniciar la entrega del dominio de nuevo' : 'Iniciar la entrega del dominio'}
                />
            ),
        );
    }

    const visibles = items.filter(Boolean);
    if (visibles.length === 0) return null;
    return <div className="flex flex-col gap-3">{visibles}</div>;
}

/**
 * Lo que el vendedor de un sitio tiene que tener resuelto antes de vender. No
 * se declara: el dominio se consulta en el registro público al firmar, y si
 * falta algo la firma dice qué.
 */
export function SaleRequirementsPanel({ steps }: { steps: HandoverStepDto[] }) {
    if (steps.length === 0) return null;

    return (
        <Panel title="ANTES DE VENDER">
            <div className="flex flex-col gap-5">
                {steps.map((step) => (
                    <div key={step.key ?? step.id} className="flex flex-col gap-2">
                        <h3 className="text-[16px] font-medium">{step.title ?? step.description}</h3>
                        {step.instruction && (
                            <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">{step.instruction}</p>
                        )}
                        {step.details && step.details.length > 0 && (
                            <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] leading-relaxed text-[var(--color-tenue)]">
                                {step.details.map((d) => (
                                    <li key={d}>{d}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                ))}
                <p className="text-[13px] leading-relaxed text-[var(--color-apagado)]">
                    Lo comprobamos solos cuando se firme el contrato: si falta algo, te decimos qué.
                </p>
            </div>
        </Panel>
    );
}

/** Antes de ofertar por un sitio: qué implica recibir el dominio. */
export function DomainLockNotice() {
    return (
        <p className="text-[13px] leading-relaxed text-[var(--color-tenue)]">
            Cuando recibas el dominio, durante 60 días no se va a poder mudar a otro registrador: es una regla de la
            ICANN. Mientras tanto es tuyo y funciona desde tu cuenta de Hostinger.
        </p>
    );
}
