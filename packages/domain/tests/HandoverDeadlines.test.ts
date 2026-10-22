import { describe, it, expect } from 'vitest';
import {
    BusinessCalendar,
    DEFAULT_HANDOVER_DEADLINES,
    HandoverDeadlines,
} from '../src/value-objects/HandoverDeadlines';

/**
 * Los plazos que destraban una operación: cada uno se calcula desde el hito
 * que lo ancla. Los días hábiles se cuentan en hora de Argentina (UTC-3, sin
 * horario de verano), de lunes a viernes y sin los feriados configurados, y un
 * plazo en días hábiles vence al terminar el último de ellos.
 */

describe('BusinessCalendar', () => {
    it('lunes a viernes son hábiles; sábado, domingo y feriados no', () => {
        const calendar = new BusinessCalendar(['2026-10-27']);

        expect(calendar.isBusinessDay('2026-10-23')).toBe(true); // viernes
        expect(calendar.isBusinessDay('2026-10-24')).toBe(false); // sábado
        expect(calendar.isBusinessDay('2026-10-25')).toBe(false); // domingo
        expect(calendar.isBusinessDay('2026-10-27')).toBe(false); // martes feriado
    });

    it('rechaza un feriado mal escrito', () => {
        expect(() => new BusinessCalendar(['27/10/2026'])).toThrow();
    });

    /*
     * El escenario de la spec: el activo entra en custodia un viernes y hay un
     * feriado el martes siguiente. Los cinco días hábiles son lunes,
     * miércoles, jueves, viernes y el lunes siguiente, y el plazo vence al
     * terminar ese segundo lunes.
     */
    it('cinco días hábiles desde un viernes con feriado el martes vencen al terminar el segundo lunes', () => {
        const calendar = new BusinessCalendar(['2026-10-27']);
        const viernes = new Date('2026-10-23T15:00:00-03:00');

        expect(calendar.endOfBusinessDays(viernes, 5)).toEqual(new Date('2026-11-02T23:59:59.999-03:00'));
    });

    it('cuenta el día en hora de Argentina aunque en UTC ya sea el siguiente', () => {
        const calendar = new BusinessCalendar([]);
        // Viernes 23 a las 22 en Argentina es sábado 24 a la 1 en UTC.
        const viernesALaNoche = new Date('2026-10-24T01:00:00Z');

        expect(calendar.endOfBusinessDays(viernesALaNoche, 1)).toEqual(new Date('2026-10-26T23:59:59.999-03:00'));
    });
});

describe('HandoverDeadlines', () => {
    const deadlines = new HandoverDeadlines(DEFAULT_HANDOVER_DEADLINES, new BusinessCalendar(['2026-10-27']));
    const DAY = 24 * 60 * 60 * 1000;

    it('los valores por defecto son los decididos', () => {
        expect(DEFAULT_HANDOVER_DEADLINES).toEqual({
            sellerHandoverDays: 10,
            buyerPaymentBusinessDays: 5,
            sellerDeliveryDays: 5,
            buyerConfirmationDays: 3,
            sellerTransferConfirmationBusinessDays: 2,
        });
    });

    it('el vendedor tiene 10 días desde la firma para ceder', () => {
        const signedAt = new Date('2026-10-21T12:00:00Z');

        expect(deadlines.sellerHandover(signedAt)).toEqual(new Date(signedAt.getTime() + 10 * DAY));
    });

    it('el comprador tiene 5 días hábiles desde la custodia para pagar', () => {
        expect(deadlines.buyerPayment(new Date('2026-10-23T15:00:00-03:00'))).toEqual(
            new Date('2026-11-02T23:59:59.999-03:00'),
        );
    });

    it('el vendedor tiene 5 días desde el pago para entregar lo que no se comprueba solo', () => {
        const paidAt = new Date('2026-10-21T12:00:00Z');

        expect(deadlines.sellerDelivery(paidAt)).toEqual(new Date(paidAt.getTime() + 5 * DAY));
    });

    it('el comprador tiene 3 días desde la última entrega para confirmar', () => {
        const deliveredAt = new Date('2026-10-21T12:00:00Z');

        expect(deadlines.buyerConfirmation(deliveredAt)).toEqual(new Date(deliveredAt.getTime() + 3 * DAY));
    });

    it('el vendedor tiene 2 días hábiles para confirmar que le llegó su transferencia', () => {
        // Jueves 22: viernes 23 y lunes 26 (el martes 27 es feriado).
        expect(deadlines.sellerTransferConfirmation(new Date('2026-10-22T10:00:00-03:00'))).toEqual(
            new Date('2026-10-26T23:59:59.999-03:00'),
        );
    });

    it('los plazos se configuran en un solo lugar', () => {
        const cortos = new HandoverDeadlines({ ...DEFAULT_HANDOVER_DEADLINES, sellerHandoverDays: 1 }, new BusinessCalendar([]));
        const signedAt = new Date('2026-10-21T12:00:00Z');

        expect(cortos.sellerHandover(signedAt)).toEqual(new Date(signedAt.getTime() + DAY));
    });
});
