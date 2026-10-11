import { describe, it, expect } from 'vitest';
import { accessCountdown } from '@/lib/accessCountdown';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-13T12:00:00Z');

describe('accessCountdown', () => {
    it('cuenta los días que faltan y rellena los segmentos transcurridos', () => {
        const from = new Date(now.getTime() + 4 * DAY).toISOString();
        expect(accessCountdown(from, now)).toEqual({ daysLeft: 4, filled: 3, total: 7 });
    });

    it('redondea hacia arriba: con 3 días y una hora todavía faltan 4', () => {
        const from = new Date(now.getTime() + 3 * DAY + 60 * 60 * 1000).toISOString();
        expect(accessCountdown(from, now).daysLeft).toBe(4);
    });

    it('recién confirmado: ningún segmento lleno', () => {
        const from = new Date(now.getTime() + 7 * DAY).toISOString();
        expect(accessCountdown(from, now)).toEqual({ daysLeft: 7, filled: 0, total: 7 });
    });

    it('vencido o con fecha inválida no se sale del rango', () => {
        expect(accessCountdown(new Date(now.getTime() - DAY).toISOString(), now)).toEqual({
            daysLeft: 0,
            filled: 7,
            total: 7,
        });
        expect(accessCountdown('no es una fecha', now).daysLeft).toBe(0);
        expect(accessCountdown(new Date(now.getTime() + 30 * DAY).toISOString(), now).filled).toBe(0);
    });
});
