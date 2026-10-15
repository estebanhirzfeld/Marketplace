import { describe, it, expect, vi } from 'vitest';
import {
    DNS_TRANSPORT_ERROR,
    safeChallenge,
    safeCheck,
    visibleCheckState,
} from '@/lib/dnsDialogActions';

/**
 * Las llamadas del diálogo viajan por RPC: si la red falla, el vendedor tiene
 * que ver un aviso y poder reintentar, no una pantalla de error.
 */

describe('safeCheck', () => {
    it('devuelve lo que responde la acción, marcado con la sesión', async () => {
        const action = vi.fn().mockResolvedValue({ verified: true });

        expect(await safeCheck(action, {}, 2)).toEqual({ verified: true, session: 2 });
    });

    it('si la llamada se rechaza, la convierte en un error que se muestra', async () => {
        const action = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

        expect(await safeCheck(action, {}, 1)).toEqual({ verified: false, error: DNS_TRANSPORT_ERROR, session: 1 });
        expect(DNS_TRANSPORT_ERROR).toBe('No pudimos consultar tu DNS. Probá de nuevo.');
    });
});

describe('safeChallenge', () => {
    it('devuelve el resultado tal cual', async () => {
        const result = { error: 'No disponible' };

        expect(await safeChallenge(async () => result)).toEqual(result);
    });

    it('si la llamada se rechaza, devuelve un error en vez de lanzar', async () => {
        const result = await safeChallenge(async () => {
            throw new Error('Failed to fetch');
        });

        expect(result).toEqual({ error: DNS_TRANSPORT_ERROR });
    });
});

describe('visibleCheckState', () => {
    it('muestra el resultado de la sesión actual', () => {
        expect(visibleCheckState({ verified: false, error: 'x', session: 3 }, 3)).toEqual({ verified: false, error: 'x' });
    });

    it('descarta el resultado de una sesión anterior', () => {
        expect(visibleCheckState({ verified: true, session: 1 }, 2)).toEqual({});
    });
});
