import { describe, it, expect } from 'vitest';
import { fieldValue } from '@/lib/format';

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
