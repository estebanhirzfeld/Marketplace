import { describe, it, expect } from 'vitest';
import {
    TransferStepProgress,
    TransferStepProgressStatus,
} from '../src/entities/TransferStepProgress';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { InvalidStateError, ValidationError } from '../src/errors/DomainError';

const DAY_MS = 24 * 60 * 60 * 1000;
const STARTED_AT = new Date('2026-10-20T12:00:00Z');
/** Las invitaciones de traslado vencen a los 10 días. */
const DEADLINE_AT = new Date(STARTED_AT.getTime() + 10 * DAY_MS);

function daysAfterStart(days: number): Date {
    return new Date(STARTED_AT.getTime() + days * DAY_MS);
}

function startStep(overrides: { deadlineAt?: Date | undefined } = {}): TransferStepProgress {
    return TransferStepProgress.start({
        scope: 'operation',
        scopeId: 'operation-1',
        stepKey: 'domain-to-platform',
        startedAt: STARTED_AT,
        deadlineAt: 'deadlineAt' in overrides ? overrides.deadlineAt : DEADLINE_AT,
    });
}

/** Lleva un paso nuevo al estado pedido usando solo las transiciones públicas. */
function stepIn(status: TransferStepProgressStatus): TransferStepProgress {
    const step = startStep();
    const now = daysAfterStart(1);
    if (status === 'waiting') step.markWaiting(now);
    if (status === 'done') step.markDone(now);
    if (status === 'rejected') step.markRejected(now);
    if (status === 'expired') step.markExpired(DEADLINE_AT);
    return step;
}

describe('TransferStepProgress: alta', () => {
    it('nace pendiente, con el plazo y sin recordatorio ni escalada', () => {
        const step = startStep();

        expect(step.scope).toBe('operation');
        expect(step.scopeId).toBe('operation-1');
        expect(step.stepKey).toBe('domain-to-platform');
        expect(step.status).toBe('pending');
        expect(step.startedAt).toEqual(STARTED_AT);
        expect(step.deadlineAt).toEqual(DEADLINE_AT);
        expect(step.lastCheckedAt).toBeUndefined();
        expect(step.remindedAt).toBeUndefined();
        expect(step.escalatedAt).toBeUndefined();
        expect(step.attestedBy).toBeUndefined();
        expect(step.evidence).toEqual({});
    });

    it('admite un paso sin plazo', () => {
        const step = startStep({ deadlineAt: undefined });

        expect(step.deadlineAt).toBeUndefined();
    });

    it.each([
        ['scopeId', { scopeId: '  ' }],
        ['stepKey', { stepKey: '' }],
    ])('rechaza un %s vacío', (_campo, override) => {
        expect(() =>
            TransferStepProgress.start({
                scope: 'listing',
                scopeId: 'listing-1',
                stepKey: 'domain-in-hostinger',
                startedAt: STARTED_AT,
                ...override,
            }),
        ).toThrow(ValidationError);
    });

    it('rechaza un plazo que no es posterior al inicio', () => {
        expect(() => startStep({ deadlineAt: STARTED_AT })).toThrow(ValidationError);
        expect(() => startStep({ deadlineAt: daysAfterStart(-1) })).toThrow(ValidationError);
    });
});

describe('TransferStepProgress: transiciones', () => {
    const allowed: Array<[TransferStepProgressStatus, TransferStepProgressStatus]> = [
        ['pending', 'waiting'],
        ['pending', 'done'],
        ['pending', 'rejected'],
        ['pending', 'expired'],
        ['waiting', 'done'],
        ['waiting', 'rejected'],
        ['waiting', 'expired'],
        ['expired', 'done'],
        ['expired', 'rejected'],
    ];
    const forbidden: Array<[TransferStepProgressStatus, TransferStepProgressStatus]> = [
        ['waiting', 'waiting'],
        ['done', 'waiting'],
        ['done', 'done'],
        ['done', 'rejected'],
        ['done', 'expired'],
        ['rejected', 'waiting'],
        ['rejected', 'done'],
        ['rejected', 'expired'],
        ['expired', 'waiting'],
        ['expired', 'expired'],
    ];

    function transition(step: TransferStepProgress, to: TransferStepProgressStatus): void {
        // Pasado el plazo, para que `expired` sea alcanzable desde cualquier estado abierto.
        const now = new Date(DEADLINE_AT.getTime() + DAY_MS);
        if (to === 'waiting') step.markWaiting(now);
        if (to === 'done') step.markDone(now);
        if (to === 'rejected') step.markRejected(now);
        if (to === 'expired') step.markExpired(now);
    }

    it.each(allowed)('permite pasar de %s a %s', (from, to) => {
        const step = stepIn(from);

        transition(step, to);

        expect(step.status).toBe(to);
    });

    it.each(forbidden)('no permite pasar de %s a %s', (from, to) => {
        const step = stepIn(from);

        expect(() => transition(step, to)).toThrow(InvalidStateError);
        expect(step.status).toBe(from);
    });

    it('no vence antes del plazo ni cuando no tiene plazo', () => {
        expect(() => startStep().markExpired(daysAfterStart(9))).toThrow(InvalidStateError);
        expect(() => startStep({ deadlineAt: undefined }).markExpired(daysAfterStart(99))).toThrow(
            InvalidStateError,
        );
    });

    it('acumula la evidencia sin perder la anterior', () => {
        const step = startStep();

        step.markWaiting(daysAfterStart(1), { invitationSeenAt: '2026-10-21T10:00:00Z' });
        step.markDone(daysAfterStart(2), { evidence: { transferId: 'tr-9' }, attestedBy: 'admin-1' });

        expect(step.evidence).toEqual({ invitationSeenAt: '2026-10-21T10:00:00Z', transferId: 'tr-9' });
        expect(step.attestedBy).toBe('admin-1');
        expect(step.lastCheckedAt).toEqual(daysAfterStart(2));
    });

    it('registra la última comprobación sin cambiar el estado', () => {
        const step = startStep();

        step.recordCheck(daysAfterStart(2));

        expect(step.status).toBe('pending');
        expect(step.lastCheckedAt).toEqual(daysAfterStart(2));
    });

    it('no registra comprobaciones de un paso terminado', () => {
        expect(() => stepIn('done').recordCheck(daysAfterStart(2))).toThrow(InvalidStateError);
    });
});

describe('TransferStepProgress: plazos con reloj inyectado', () => {
    it('vence exactamente al llegar el plazo, no antes', () => {
        const step = startStep();

        expect(step.isOverdue(new Date(DEADLINE_AT.getTime() - 1))).toBe(false);
        expect(step.isOverdue(DEADLINE_AT)).toBe(true);
        expect(step.isOverdue(daysAfterStart(30))).toBe(true);
    });

    it('un paso sin plazo nunca vence', () => {
        const step = startStep({ deadlineAt: undefined });

        expect(step.isOverdue(daysAfterStart(365))).toBe(false);
        expect(step.needsReminder(daysAfterStart(365))).toBe(false);
        expect(step.needsEscalation(daysAfterStart(365))).toBe(false);
    });

    it('un paso resuelto o rechazado no vence', () => {
        expect(stepIn('done').isOverdue(daysAfterStart(30))).toBe(false);
        expect(stepIn('rejected').isOverdue(daysAfterStart(30))).toBe(false);
    });

    it('un paso vencido sigue estando vencido', () => {
        expect(stepIn('expired').isOverdue(daysAfterStart(30))).toBe(true);
    });

    it('pide el recordatorio a 3 días del plazo, por defecto', () => {
        const step = startStep();

        expect(step.needsReminder(daysAfterStart(6))).toBe(false);
        expect(step.needsReminder(daysAfterStart(7))).toBe(true);
        expect(step.needsReminder(daysAfterStart(9))).toBe(true);
    });

    it('permite configurar la anticipación del recordatorio', () => {
        const step = startStep();

        expect(step.needsReminder(daysAfterStart(8), DAY_MS)).toBe(false);
        expect(step.needsReminder(daysAfterStart(9), DAY_MS)).toBe(true);
    });

    it('no pide recordatorio una vez vencido: ahí corresponde la escalada', () => {
        expect(startStep().needsReminder(DEADLINE_AT)).toBe(false);
    });

    it('el recordatorio se pide una sola vez', () => {
        const step = startStep();
        const now = daysAfterStart(7);

        step.markReminded(now);

        expect(step.remindedAt).toEqual(now);
        expect(step.needsReminder(daysAfterStart(8))).toBe(false);
        expect(() => step.markReminded(daysAfterStart(8))).toThrow(InvalidStateError);
    });

    it('no marca el recordatorio antes de que corresponda', () => {
        expect(() => startStep().markReminded(daysAfterStart(1))).toThrow(InvalidStateError);
    });

    it('no pide recordatorio de un paso terminado', () => {
        expect(stepIn('done').needsReminder(daysAfterStart(8))).toBe(false);
        expect(stepIn('rejected').needsReminder(daysAfterStart(8))).toBe(false);
    });

    it('pide la escalada al vencer, una sola vez', () => {
        const step = startStep();

        expect(step.needsEscalation(new Date(DEADLINE_AT.getTime() - 1))).toBe(false);
        expect(step.needsEscalation(DEADLINE_AT)).toBe(true);

        step.markEscalated(DEADLINE_AT);

        expect(step.escalatedAt).toEqual(DEADLINE_AT);
        expect(step.needsEscalation(daysAfterStart(11))).toBe(false);
        expect(() => step.markEscalated(daysAfterStart(11))).toThrow(InvalidStateError);
    });

    it('la escalada también corresponde si el paso ya quedó vencido', () => {
        expect(stepIn('expired').needsEscalation(daysAfterStart(11))).toBe(true);
    });

    it('no pide escalada de un paso terminado', () => {
        expect(stepIn('done').needsEscalation(daysAfterStart(30))).toBe(false);
        expect(stepIn('rejected').needsEscalation(daysAfterStart(30))).toBe(false);
    });

    it('no marca la escalada antes del plazo', () => {
        expect(() => startStep().markEscalated(daysAfterStart(5))).toThrow(InvalidStateError);
    });
});

describe('TransferStepProgress: rehidratación', () => {
    it('reconstituye sin validar ni completar nada', () => {
        const original = startStep();
        original.markWaiting(daysAfterStart(1), { seen: true });
        const { id, createdAt, props } = original.toSnapshot();

        const copy = TransferStepProgress.reconstitute(props, new UniqueEntityID(id), createdAt);

        expect(copy.status).toBe('waiting');
        expect(copy.evidence).toEqual({ seen: true });
        expect(copy.id.toString()).toBe(id);
    });
});
