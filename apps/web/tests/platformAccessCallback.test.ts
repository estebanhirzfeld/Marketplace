import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@marketplace/api-client';
import { YOUTUBE_STATE_COOKIE } from '@/lib/youtubeConnection';
import { ACCESS_STATE_COOKIE } from '@/lib/platformAccessVerification';

/**
 * El callback de Google en modo «acceso de la plataforma»: el `state` tiene que
 * coincidir con la cookie del admin ANTES de llamar a la API, y el resultado
 * vuelve al panel donde se lo puede leer.
 */

const STATE = 'acceso:l1:' + 'a'.repeat(32);
const store = { get: vi.fn(), delete: vi.fn() };
const verifyPlatformAccess = vi.fn();
const readSession = vi.fn();

vi.mock('next/headers', () => ({ cookies: async () => store }));
vi.mock('@/lib/session', () => ({ readSession: () => readSession() }));
vi.mock('@/lib/api', () => ({ api: () => ({ verifyPlatformAccess }) }));

import { GET } from '@/app/api/youtube/callback/route';

function llamar(query: string) {
    return GET(new Request(`http://localhost:3000/api/youtube/callback${query}`));
}

function destino(res: Response): string {
    const url = new URL(res.headers.get('location') ?? '');
    return url.pathname + url.search;
}

beforeEach(() => {
    vi.resetAllMocks();
    readSession.mockResolvedValue({ token: 't', actor: { id: 'admin-1', role: 'admin' } });
    store.get.mockImplementation((name: string) => (name === ACCESS_STATE_COOKIE ? { name, value: STATE } : undefined));
});

describe('callback de Google en modo acceso de la plataforma', () => {
    it('con state propio verifica el acceso y vuelve al panel con «ok»', async () => {
        verifyPlatformAccess.mockResolvedValue(undefined);

        const res = await llamar(`?code=abc&state=${encodeURIComponent(STATE)}`);

        expect(verifyPlatformAccess).toHaveBeenCalledWith('l1', 'abc');
        expect(destino(res)).toBe('/admin?acceso=ok&activo=l1');
    });

    it('borra solo su cookie, en todos los caminos, y no la de la conexión del vendedor', async () => {
        verifyPlatformAccess.mockResolvedValue(undefined);
        await llamar(`?code=abc&state=${encodeURIComponent(STATE)}`);

        expect(store.delete).toHaveBeenCalledWith({ name: ACCESS_STATE_COOKIE, path: '/api/youtube' });
        expect(store.delete).not.toHaveBeenCalledWith(expect.objectContaining({ name: YOUTUBE_STATE_COOKIE }));
    });

    it('un state que no coincide con la cookie NUNCA llama a la API', async () => {
        const res = await llamar(`?code=abc&state=${encodeURIComponent('acceso:l1:' + 'b'.repeat(32))}`);

        expect(verifyPlatformAccess).not.toHaveBeenCalled();
        expect(destino(res)).toBe('/admin?acceso=invalida');
    });

    it('sin cookie tampoco llama a la API', async () => {
        store.get.mockReturnValue(undefined);

        const res = await llamar(`?code=abc&state=${encodeURIComponent(STATE)}`);

        expect(verifyPlatformAccess).not.toHaveBeenCalled();
        expect(destino(res)).toBe('/admin?acceso=invalida');
    });

    it('si quien vuelve no es admin, no llama a la API', async () => {
        readSession.mockResolvedValue({ token: 't', actor: { id: 'u1', role: 'seller' } });

        const res = await llamar(`?code=abc&state=${encodeURIComponent(STATE)}`);

        expect(verifyPlatformAccess).not.toHaveBeenCalled();
        expect(destino(res)).toBe('/ingresar');
    });

    it('si cancela en Google vuelve con «cancelada»', async () => {
        const res = await llamar(`?error=access_denied&state=${encodeURIComponent(STATE)}`);

        expect(verifyPlatformAccess).not.toHaveBeenCalled();
        expect(destino(res)).toBe('/admin?acceso=cancelada&activo=l1');
    });

    it('si la cuenta elegida no administra el canal (403) vuelve con «sin-acceso»', async () => {
        verifyPlatformAccess.mockRejectedValue(new ApiError('FORBIDDEN', 'La cuenta elegida no administra este canal.', 403));

        const res = await llamar(`?code=abc&state=${encodeURIComponent(STATE)}`);

        expect(destino(res)).toBe('/admin?acceso=sin-acceso&activo=l1');
    });

    it('si ingresó con otra cuenta de Google (403) vuelve con «otra-cuenta» y el mensaje', async () => {
        const mensaje = 'Ingresaste con otra cuenta de Google. Usá la cuenta de custodia (c@t.com).';
        verifyPlatformAccess.mockRejectedValue(new ApiError('FORBIDDEN', mensaje, 403));

        const res = await llamar(`?code=abc&state=${encodeURIComponent(STATE)}`);

        expect(destino(res)).toBe(`/admin?acceso=otra-cuenta&activo=l1&${new URLSearchParams({ detalle: mensaje })}`);
    });

    it('si Google no informa quién inició sesión (403) vuelve con «error» y el mensaje', async () => {
        const mensaje = 'Google no informó quién inició sesión; volvé a intentarlo.';
        verifyPlatformAccess.mockRejectedValue(new ApiError('FORBIDDEN', mensaje, 403));

        const res = await llamar(`?code=abc&state=${encodeURIComponent(STATE)}`);

        expect(destino(res)).toBe(`/admin?acceso=error&activo=l1&${new URLSearchParams({ detalle: mensaje })}`);
    });

    it('cualquier otra falla vuelve con «error» y el mensaje de la API', async () => {
        verifyPlatformAccess.mockRejectedValue(new ApiError('INVALID_STATE', 'El acceso ya está registrado.', 409));

        const res = await llamar(`?code=abc&state=${encodeURIComponent(STATE)}`);

        expect(destino(res)).toBe(`/admin?acceso=error&activo=l1&${new URLSearchParams({ detalle: 'El acceso ya está registrado.' })}`);
    });
});
