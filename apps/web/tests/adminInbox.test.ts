import { describe, it, expect } from 'vitest';
import { adminPendingTotal, chooseInboxTab, pendingHeadline, shortAgo } from '@/lib/adminInbox';

describe('adminPendingTotal', () => {
    it('suma accesos, revisión y reclamos abiertos', () => {
        expect(adminPendingTotal({ accesos: 2, revision: 1, reclamos: 3 })).toBe(6);
    });
});

describe('pendingHeadline', () => {
    it('concuerda en número y dice «Nada pendiente.» en cero', () => {
        expect(pendingHeadline(3)).toBe('3 cosas esperan un movimiento nuestro.');
        expect(pendingHeadline(1)).toBe('1 cosa espera un movimiento nuestro.');
        expect(pendingHeadline(0)).toBe('Nada pendiente.');
    });
});

describe('chooseInboxTab', () => {
    it('respeta la pestaña pedida si existe', () => {
        expect(chooseInboxTab('reclamos', { accesos: 2, revision: 0, reclamos: 0 })).toBe('reclamos');
    });

    it('sin pedido o con uno desconocido, abre la primera con pendientes', () => {
        expect(chooseInboxTab(undefined, { accesos: 0, revision: 2, reclamos: 1 })).toBe('revision');
        expect(chooseInboxTab('otra', { accesos: 0, revision: 0, reclamos: 4 })).toBe('reclamos');
    });

    it('sin nada pendiente abre accesos', () => {
        expect(chooseInboxTab(undefined, { accesos: 0, revision: 0, reclamos: 0 })).toBe('accesos');
    });
});

describe('shortAgo', () => {
    const now = new Date('2026-10-11T12:00:00.000Z');

    it('minutos, horas y días en forma corta', () => {
        expect(shortAgo('2026-10-11T11:59:40.000Z', now)).toBe('recién');
        expect(shortAgo('2026-10-11T11:30:00.000Z', now)).toBe('hace 30 min');
        expect(shortAgo('2026-10-11T10:00:00.000Z', now)).toBe('hace 2 h');
        expect(shortAgo('2026-10-10T12:00:00.000Z', now)).toBe('hace 1 d');
    });

    it('una fecha futura o inválida cuenta como recién', () => {
        expect(shortAgo('2026-10-12T12:00:00.000Z', now)).toBe('recién');
        expect(shortAgo('basura', now)).toBe('recién');
    });
});
