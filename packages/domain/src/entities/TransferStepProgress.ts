import { Entity } from './Entity';
import { UniqueEntityID } from '../value-objects/UniqueEntityID';
import { InvalidStateError, ValidationError } from '../errors/DomainError';

/** A qué pertenece el paso: al activo (antes de la operación) o a la operación. */
export type TransferStepScope = 'listing' | 'operation';

/**
 * - `pending`: el paso empezó y no hay ninguna señal todavía.
 * - `waiting`: hay una señal parcial (p. ej. la invitación se vio o se aceptó y
 *   falta la confirmación); se sigue esperando.
 * - `done`: el paso se cumplió.
 * - `expired`: pasó el plazo sin cumplirse; lo resuelve una persona.
 * - `rejected`: la otra parte rechazó o el paso no puede cumplirse.
 */
export type TransferStepProgressStatus = 'pending' | 'waiting' | 'done' | 'expired' | 'rejected';

export interface TransferStepProgressProps {
    scope: TransferStepScope;
    scopeId: string;
    /** La `key` estable del `TransferStep` que declara la estrategia del activo. */
    stepKey: string;
    status: TransferStepProgressStatus;
    startedAt: Date;
    deadlineAt?: Date;
    lastCheckedAt?: Date;
    remindedAt?: Date;
    escalatedAt?: Date;
    /** Lo que se observó al comprobar el paso (ids de traslado, fechas, notas). */
    evidence: Record<string, unknown>;
    /** Quién lo declaró cumplido cuando la comprobación no es automática. */
    attestedBy?: string;
}

export type StartTransferStepProgressProps = Pick<
    TransferStepProgressProps,
    'scope' | 'scopeId' | 'stepKey' | 'startedAt' | 'deadlineAt'
>;

/** Cuánto antes del plazo se avisa por única vez: 3 días. */
export const DEFAULT_REMINDER_LEAD_MS = 3 * 24 * 60 * 60 * 1000;

const ALLOWED_TRANSITIONS: Record<TransferStepProgressStatus, readonly TransferStepProgressStatus[]> = {
    pending: ['waiting', 'done', 'rejected', 'expired'],
    waiting: ['done', 'rejected', 'expired'],
    // Vencido no es final: la persona que lo resuelve puede darlo por cumplido o rechazado.
    expired: ['done', 'rejected'],
    done: [],
    rejected: [],
};

/**
 * El progreso de un paso del traspaso de un activo.
 *
 * Los pasos mismos los declara la estrategia del activo; esto guarda lo que les
 * pasó: en qué estado están, desde cuándo, hasta cuándo y qué se observó. La
 * ausencia de progreso significa "pendiente y sin plazo".
 *
 * Los plazos dependen del reloj, y el reloj entra siempre como argumento (igual
 * que `Listing.assertCanBeTransferred(ahora)`): la entidad no llama a `new Date()`.
 */
export class TransferStepProgress extends Entity<TransferStepProgressProps> {
    private constructor(props: TransferStepProgressProps, id?: UniqueEntityID, createdAt?: Date) {
        super(props, id, createdAt);
    }

    /** Paso NUEVO: nace pendiente. */
    public static start(props: StartTransferStepProgressProps): TransferStepProgress {
        assertNotBlank(props.scopeId, 'El identificador del activo u operación es obligatorio.');
        assertNotBlank(props.stepKey, 'La clave del paso es obligatoria.');
        if (props.deadlineAt && props.deadlineAt.getTime() <= props.startedAt.getTime()) {
            throw new ValidationError('El plazo del paso debe ser posterior a su inicio.');
        }

        return new TransferStepProgress({ ...props, status: 'pending', evidence: {} });
    }

    /** Rehidrata desde la DB: no valida ni completa nada. */
    public static reconstitute(props: TransferStepProgressProps, id: UniqueEntityID, createdAt: Date): TransferStepProgress {
        return new TransferStepProgress(props, id, createdAt);
    }

    public get scope(): TransferStepScope { return this.props.scope; }
    public get scopeId(): string { return this.props.scopeId; }
    public get stepKey(): string { return this.props.stepKey; }
    public get status(): TransferStepProgressStatus { return this.props.status; }
    public get startedAt(): Date { return this.props.startedAt; }
    public get deadlineAt(): Date | undefined { return this.props.deadlineAt; }
    public get lastCheckedAt(): Date | undefined { return this.props.lastCheckedAt; }
    public get remindedAt(): Date | undefined { return this.props.remindedAt; }
    public get escalatedAt(): Date | undefined { return this.props.escalatedAt; }
    public get evidence(): Record<string, unknown> { return { ...this.props.evidence }; }
    public get attestedBy(): string | undefined { return this.props.attestedBy; }

    /** Sigue en curso: todavía puede cumplirse por las señales normales. */
    public isOpen(): boolean {
        return this.props.status === 'pending' || this.props.status === 'waiting';
    }

    /** Pasó el plazo sin que el paso se cumpliera ni se rechazara. */
    public isOverdue(now: Date): boolean {
        const { deadlineAt, status } = this.props;
        if (!deadlineAt) return false;
        if (status === 'done' || status === 'rejected') return false;
        return now.getTime() >= deadlineAt.getTime();
    }

    /**
     * Toca avisar, una sola vez, cuando falta `leadMs` o menos para el plazo.
     * Ya vencido no corresponde un recordatorio sino la escalada.
     */
    public needsReminder(now: Date, leadMs: number = DEFAULT_REMINDER_LEAD_MS): boolean {
        const { deadlineAt, remindedAt } = this.props;
        if (!this.isOpen() || !deadlineAt || remindedAt) return false;
        if (this.isOverdue(now)) return false;
        return now.getTime() >= deadlineAt.getTime() - leadMs;
    }

    /** Toca escalar al admin, una sola vez, al vencer el plazo. */
    public needsEscalation(now: Date): boolean {
        return this.isOverdue(now) && !this.props.escalatedAt;
    }

    public markReminded(now: Date, leadMs: number = DEFAULT_REMINDER_LEAD_MS): void {
        if (!this.needsReminder(now, leadMs)) {
            throw new InvalidStateError('El paso no necesita recordatorio ahora.');
        }
        this.props.remindedAt = now;
    }

    public markEscalated(now: Date): void {
        if (!this.needsEscalation(now)) {
            throw new InvalidStateError('El paso no necesita escalarse ahora.');
        }
        this.props.escalatedAt = now;
    }

    /** Hay una señal parcial: se sigue esperando la confirmación. */
    public markWaiting(now: Date, evidence: Record<string, unknown> = {}): void {
        this.transitionTo('waiting');
        this.observe(now, evidence);
    }

    /** El paso se cumplió. `attestedBy` va cuando lo declaró una persona. */
    public markDone(now: Date, data: { evidence?: Record<string, unknown>; attestedBy?: string } = {}): void {
        this.transitionTo('done');
        this.observe(now, data.evidence ?? {});
        if (data.attestedBy) this.props.attestedBy = data.attestedBy;
    }

    public markRejected(now: Date, evidence: Record<string, unknown> = {}): void {
        this.transitionTo('rejected');
        this.observe(now, evidence);
    }

    /** Solo vence pasado el plazo. */
    public markExpired(now: Date): void {
        if (!this.isOverdue(now)) {
            throw new InvalidStateError('El paso todavía está dentro del plazo.');
        }
        this.transitionTo('expired');
    }

    /** Anota que se volvió a comprobar el paso, sin cambiar su estado. */
    public recordCheck(now: Date): void {
        if (!this.isOpen()) {
            throw new InvalidStateError('El paso ya no está en curso.');
        }
        this.props.lastCheckedAt = now;
    }

    private transitionTo(next: TransferStepProgressStatus): void {
        if (!ALLOWED_TRANSITIONS[this.props.status].includes(next)) {
            throw new InvalidStateError(
                `El paso no puede pasar de "${this.props.status}" a "${next}".`,
            );
        }
        this.props.status = next;
    }

    private observe(now: Date, evidence: Record<string, unknown>): void {
        this.props.lastCheckedAt = now;
        this.props.evidence = { ...this.props.evidence, ...evidence };
    }
}

function assertNotBlank(value: string, message: string): void {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new ValidationError(message);
    }
}
