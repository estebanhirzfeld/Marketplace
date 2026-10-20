import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LINK_COOKIE } from '@/lib/mercadopagoLink';

/**
 * La vuelta de Mercado Pago es la única defensa contra que alguien deje su
 * propia cuenta vinculada a la de otra persona: el `state` de la dirección
 * tiene que coincidir con el de la cookie. Estos tests fijan que esa
 * comprobación corre antes de llamar a la API y que la cookie se borra siempre.
 */

const VERIFIER = 'v'.repeat(43);
const STATE = 'a'.repeat(32);

const store = { get: vi.fn(), delete: vi.fn() };
const linkMercadoPago = vi.fn();
const readSession = vi.fn();

vi.mock('next/headers', () => ({ cookies: async () => store }));
vi.mock('@/lib/session', () => ({ readSession: () => readSession() }));
vi.mock('@/lib/api', () => ({ api: () => ({ linkMercadoPago }) }));

import { GET } from '@/app/mercadopago/callback/route';

function llamar(query: string) {
    return GET(new Request(`http://localhost:3000/mercadopago/callback${query}`));
}

function conCookie(value: string | undefined) {
    store.get.mockImplementation((name: string) =>
        name === LINK_COOKIE && value !== undefined ? { name, value } : undefined,
    );
}

const cookieValida = JSON.stringify({ state: STATE, verifier: VERIFIER });

function destino(res: Response): string {
    const url = new URL(res.headers.get('location') ?? '');
    return url.pathname + url.search;
}

beforeEach(() => {
    vi.resetAllMocks();
    readSession.mockResolvedValue({ token: 't', actor: { id: 'u1' } });
    linkMercadoPago.mockResolvedValue(undefined);
    conCookie(cookieValida);
});

function cookieBorrada() {
    expect(store.delete).toHaveBeenCalledWith({ name: LINK_COOKIE, path: '/mercadopago' });
}

describe('GET /mercadopago/callback detrás del proxy', () => {
    // La variable falsa no puede escaparse a los demás tests si uno falla.
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    /**
     * El release se compila en CI sin `NEXT_PUBLIC_APP_URL`: la dirección de la
     * vuelta tiene que salir de lo que reenvía Caddy, o la persona terminaría
     * en localhost después de vincular.
     */
    it('vuelve a la dirección pública que reenvía el proxy, no a localhost', async () => {
        vi.stubEnv('NEXT_PUBLIC_APP_URL', '');

        const res = await GET(
            new Request(`http://127.0.0.1:3000/mercadopago/callback?code=abc&state=${STATE}`, {
                headers: { 'x-forwarded-host': 'traspaso.forzalabs.online', 'x-forwarded-proto': 'https' },
            }),
        );

        expect(new URL(res.headers.get('location') ?? '').origin).toBe('https://traspaso.forzalabs.online');
    });
});

describe('GET /mercadopago/callback', () => {
    it('con código y state correctos vincula y vuelve al perfil con el aviso', async () => {
        const res = await llamar(`?code=abc&state=${STATE}`);

        expect(linkMercadoPago).toHaveBeenCalledWith({ code: 'abc', codeVerifier: VERIFIER });
        expect(destino(res)).toBe('/perfil?mercadopago=vinculada');
        cookieBorrada();
    });

    it('sin sesión manda a ingresar sin llamar a la API', async () => {
        readSession.mockResolvedValue(null);

        const res = await llamar(`?code=abc&state=${STATE}`);

        expect(destino(res)).toBe('/ingresar');
        expect(linkMercadoPago).not.toHaveBeenCalled();
        cookieBorrada();
    });

    it('si la persona canceló en Mercado Pago no llama a la API', async () => {
        const res = await llamar(`?error=access_denied&state=${STATE}`);

        expect(destino(res)).toBe('/perfil?mercadopago=error');
        expect(linkMercadoPago).not.toHaveBeenCalled();
        cookieBorrada();
    });

    it('sin código no llama a la API', async () => {
        const res = await llamar(`?state=${STATE}`);

        expect(destino(res)).toBe('/perfil?mercadopago=error');
        expect(linkMercadoPago).not.toHaveBeenCalled();
        cookieBorrada();
    });

    it('sin la cookie del intento no llama a la API', async () => {
        conCookie(undefined);

        const res = await llamar(`?code=abc&state=${STATE}`);

        expect(destino(res)).toBe('/perfil?mercadopago=error');
        expect(linkMercadoPago).not.toHaveBeenCalled();
        cookieBorrada();
    });

    it('con una cookie ilegible no llama a la API', async () => {
        conCookie('no es json');

        const res = await llamar(`?code=abc&state=${STATE}`);

        expect(destino(res)).toBe('/perfil?mercadopago=error');
        expect(linkMercadoPago).not.toHaveBeenCalled();
        cookieBorrada();
    });

    it('con un state que no coincide NUNCA llama a la API', async () => {
        const res = await llamar(`?code=abc&state=${'b'.repeat(32)}`);

        expect(destino(res)).toBe('/perfil?mercadopago=error');
        expect(linkMercadoPago).not.toHaveBeenCalled();
        cookieBorrada();
    });

    it('sin state en la dirección NUNCA llama a la API', async () => {
        const res = await llamar('?code=abc');

        expect(destino(res)).toBe('/perfil?mercadopago=error');
        expect(linkMercadoPago).not.toHaveBeenCalled();
        cookieBorrada();
    });

    it('si la API falla vuelve al perfil con el aviso de error', async () => {
        linkMercadoPago.mockRejectedValue(new Error('boom'));

        const res = await llamar(`?code=abc&state=${STATE}`);

        expect(destino(res)).toBe('/perfil?mercadopago=error');
        cookieBorrada();
    });
});
