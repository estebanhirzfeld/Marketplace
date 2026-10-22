import { describe, it, expect } from 'vitest';
import { fechaLarga, fieldValue, subscribersLabel } from '@/lib/format';

describe('fechaLarga', () => {
    /*
     * Un plazo en días hábiles vence a las 23:59 de Argentina, que en UTC ya es
     * el día siguiente. Con la zona del servidor (UTC en el VPS) se mostraba un
     * día de más.
     */
    it('escribe el día de Argentina aunque en UTC ya sea el siguiente', () => {
        expect(fechaLarga('2026-11-03T02:59:59.999Z')).toBe('2 de noviembre de 2026');
    });
});

describe('fieldValue', () => {
    it('una fecha ISO se escribe como el resto de la app, no cruda', () => {
        const v = fieldValue('date', '2026-10-09T15:00:00.000Z');

        expect(v).toBe('9 de octubre de 2026');
        expect(v).not.toContain('T');
    });

    it('una fecha ilegible se muestra tal cual en vez de "Invalid Date"', () => {
        expect(fieldValue('date', 'ayer')).toBe('ayer');
    });

    it('un dato que Google no informó dice "Sin datos"', () => {
        expect(fieldValue('text', null)).toBe('Sin datos');
    });

    it('un valor ausente o vacío sigue siendo un guion', () => {
        expect(fieldValue('text', undefined)).toBe('—');
        expect(fieldValue('text', '')).toBe('—');
    });

    it('un país informado se muestra como siempre', () => {
        expect(fieldValue('text', 'US')).toBe('US');
    });
});

describe('subscribersLabel', () => {
    it('uno va en singular', () => {
        expect(subscribersLabel(1)).toBe('1 suscriptor');
    });

    it('cero y varios van en plural, con separador de miles', () => {
        expect(subscribersLabel(0)).toBe('0 suscriptores');
        expect(subscribersLabel(2)).toBe('2 suscriptores');
        expect(subscribersLabel(12400)).toBe('12.400 suscriptores');
    });
});
