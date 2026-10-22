import { describe, it, expect } from 'vitest';
import { rejectionText } from '@/lib/receiptCopy';

/*
 * El comprador lee por qué le rechazaron el comprobante en una línea: el
 * motivo que eligió quien recibió la plata y, si lo escribió, el detalle.
 */
describe('rejectionText', () => {
    it('el motivo solo, sin detalle', () => {
        expect(rejectionText({ rejectionCode: 'not_credited' })).toBe('Todavía no se acreditó');
    });

    it('el motivo y el detalle', () => {
        expect(rejectionText({ rejectionCode: 'amount_mismatch', rejectionReason: 'Llegaron AR$ 1.400.000.' })).toBe(
            'El monto no coincide: Llegaron AR$ 1.400.000.',
        );
    });

    it('con «otro motivo», el detalle es el motivo', () => {
        expect(rejectionText({ rejectionCode: 'other', rejectionReason: 'Es de otra operación.' })).toBe('Es de otra operación.');
    });

    it('un rechazo anterior a los motivos muestra su texto', () => {
        expect(rejectionText({ rejectionReason: 'No me llegó.' })).toBe('No me llegó.');
    });
});
