import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { ApiError } from '@marketplace/api-client';
import { LINK_COOKIE, parseLinkCookie } from '@/lib/mercadopagoLink';

const store = { set: vi.fn() };
const mercadoPagoAuthorizationUrl = vi.fn();
const unlinkMercadoPago = vi.fn();
const requireCounterparty = vi.fn();
const revalidatePath = vi.fn();

/** `redirect` de Next corta la ejecución lanzando: acá se imita con un marcador. */
class Redirected extends Error {
    constructor(public readonly to: string) {
        super(`redirect:${to}`);
    }
}
const redirect = vi.fn((to: string) => {
    throw new Redirected(to);
});

vi.mock('next/headers', () => ({ cookies: async () => store }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock('@/lib/guards', () => ({ requireCounterparty: () => requireCounterparty() }));
vi.mock('@/lib/api', () => ({
    api: () => ({ mercadoPagoAuthorizationUrl, unlinkMercadoPago }),
}));

import { startMercadoPagoLink, unlinkMercadoPagoAccount } from '@/app/perfil/actions';

async function destinoDe(promesa: Promise<unknown>): Promise<string | undefined> {
    try {
        await promesa;
    } catch (e) {
        if (e instanceof Redirected) return e.to;
        throw e;
    }
    return undefined;
}

beforeEach(() => {
    vi.clearAllMocks();
    requireCounterparty.mockResolvedValue({ id: 'u1', role: 'seller' });
    mercadoPagoAuthorizationUrl.mockResolvedValue({ url: 'https://auth.mercadopago.test/authorize?x=1' });
});

describe('startMercadoPagoLink', () => {
    it('pide la dirección con state y desafío, guarda state y verificador y redirige', async () => {
        const destino = await destinoDe(startMercadoPagoLink());

        expect(destino).toBe('https://auth.mercadopago.test/authorize?x=1');

        const pedido = mercadoPagoAuthorizationUrl.mock.calls[0][0];
        const [nombre, valor, opciones] = store.set.mock.calls[0];
        const guardado = parseLinkCookie(valor);

        expect(nombre).toBe(LINK_COOKIE);
        expect(opciones).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/mercadopago', maxAge: 600 });
        // Lo que viaja a Mercado Pago es el state y el desafío; el verificador
        // solo queda en la cookie.
        expect(pedido.state).toBe(guardado?.state);
        expect(pedido.codeChallenge).toBe(
            createHash('sha256').update(guardado?.verifier ?? '').digest('base64url'),
        );
        expect(JSON.stringify(pedido)).not.toContain(guardado?.verifier);
    });

    it('si la integración no está configurada vuelve al perfil sin lanzar ni guardar nada', async () => {
        mercadoPagoAuthorizationUrl.mockRejectedValue(new ApiError('INTERNAL', 'sin configurar', 503));

        const destino = await destinoDe(startMercadoPagoLink());

        expect(destino).toBe('/perfil?mercadopago=no-disponible');
        expect(store.set).not.toHaveBeenCalled();
    });

    it('ante cualquier otra falla vuelve al perfil con el aviso de error', async () => {
        mercadoPagoAuthorizationUrl.mockRejectedValue(new Error('boom'));

        const destino = await destinoDe(startMercadoPagoLink());

        expect(destino).toBe('/perfil?mercadopago=error');
        expect(store.set).not.toHaveBeenCalled();
    });

    it('exige ser parte de una compraventa: el admin no llega a la API', async () => {
        requireCounterparty.mockRejectedValue(new Redirected('/admin'));

        const destino = await destinoDe(startMercadoPagoLink());

        expect(destino).toBe('/admin');
        expect(mercadoPagoAuthorizationUrl).not.toHaveBeenCalled();
    });
});

describe('unlinkMercadoPagoAccount', () => {
    it('desvincula y refresca el perfil', async () => {
        unlinkMercadoPago.mockResolvedValue(undefined);

        const estado = await unlinkMercadoPagoAccount({});

        expect(unlinkMercadoPago).toHaveBeenCalledOnce();
        expect(revalidatePath).toHaveBeenCalledWith('/perfil');
        expect(estado).toEqual({ ok: true });
    });

    it('si falla cuenta el motivo sin lanzar', async () => {
        unlinkMercadoPago.mockRejectedValue(new Error('boom'));

        const estado = await unlinkMercadoPagoAccount({});

        expect(estado.error).toMatch(/no pudimos/i);
        expect(revalidatePath).not.toHaveBeenCalled();
    });
});
