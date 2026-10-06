import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
    createLinkAttempt,
    statesMatch,
    LINK_COOKIE,
    LINK_COOKIE_OPTIONS,
    publicBaseUrl,
} from '@/lib/mercadopagoLink';

describe('createLinkAttempt', () => {
    it('el state son 32 caracteres hexadecimales y cambia en cada intento', () => {
        const a = createLinkAttempt();
        const b = createLinkAttempt();

        expect(a.state).toMatch(/^[0-9a-f]{32}$/);
        expect(a.state).not.toBe(b.state);
    });

    it('el verificador son 43 caracteres base64url y cambia en cada intento', () => {
        const a = createLinkAttempt();
        const b = createLinkAttempt();

        expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(a.verifier).not.toBe(b.verifier);
    });

    it('el desafío es el SHA-256 del verificador en base64url', () => {
        const { verifier, challenge } = createLinkAttempt();
        const esperado = createHash('sha256').update(verifier).digest('base64url');

        expect(challenge).toBe(esperado);
        expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });
});

describe('statesMatch', () => {
    it('acepta dos valores iguales', () => {
        expect(statesMatch('abc123', 'abc123')).toBe(true);
    });

    it('rechaza dos valores distintos del mismo largo', () => {
        expect(statesMatch('abc123', 'abc124')).toBe(false);
    });

    it('rechaza largos distintos sin lanzar', () => {
        expect(statesMatch('abc123', 'abc1234')).toBe(false);
    });

    it('rechaza vacío aunque ambos lo sean', () => {
        expect(statesMatch('', '')).toBe(false);
    });

    it('rechaza cuando falta uno de los dos', () => {
        expect(statesMatch(undefined, 'abc')).toBe(false);
        expect(statesMatch('abc', undefined)).toBe(false);
    });
});

describe('la cookie del intento', () => {
    it('es httpOnly, lax, acotada a /mercadopago y dura 10 minutos', () => {
        expect(LINK_COOKIE).toBe('traspaso_mp_link');
        expect(LINK_COOKIE_OPTIONS).toMatchObject({
            httpOnly: true,
            sameSite: 'lax',
            path: '/mercadopago',
            maxAge: 600,
        });
    });
});

/**
 * El release se compila en CI, donde `NEXT_PUBLIC_APP_URL` no existe: no se
 * puede apoyar la dirección pública solo en esa variable, o una persona que
 * vincula su cuenta en producción terminaría redirigida a localhost. Detrás de
 * Caddy la dirección real llega en los encabezados `x-forwarded-*`.
 */
describe('publicBaseUrl', () => {
    const pedido = (headers: Record<string, string> = {}, url = 'http://127.0.0.1:3000/mercadopago/callback') =>
        new Request(url, { headers });

    it('usa la variable de entorno cuando está definida', () => {
        expect(publicBaseUrl(pedido(), 'https://traspaso.forzalabs.online')).toBe(
            'https://traspaso.forzalabs.online',
        );
    });

    it('sin variable, toma el host y el protocolo que reenvía el proxy', () => {
        const base = publicBaseUrl(
            pedido({ 'x-forwarded-host': 'traspaso.forzalabs.online', 'x-forwarded-proto': 'https' }),
            undefined,
        );

        expect(base).toBe('https://traspaso.forzalabs.online');
    });

    it('una variable vacía cuenta como no definida', () => {
        const base = publicBaseUrl(
            pedido({ 'x-forwarded-host': 'traspaso.forzalabs.online', 'x-forwarded-proto': 'https' }),
            '   ',
        );

        expect(base).toBe('https://traspaso.forzalabs.online');
    });

    it('si el proxy manda una lista, usa el primer valor', () => {
        const base = publicBaseUrl(
            pedido({
                'x-forwarded-host': 'traspaso.forzalabs.online, interno:3000',
                'x-forwarded-proto': 'https, http',
            }),
            undefined,
        );

        expect(base).toBe('https://traspaso.forzalabs.online');
    });

    it('sin variable ni proxy, usa el origen del propio pedido', () => {
        expect(publicBaseUrl(pedido({}, 'http://localhost:3000/x'), undefined)).toBe('http://localhost:3000');
    });

    it('descarta un host reenviado que no parece un host', () => {
        const base = publicBaseUrl(
            pedido(
                { 'x-forwarded-host': 'evil.com/phishing?x=', 'x-forwarded-proto': 'https' },
                'http://localhost:3000/x',
            ),
            undefined,
        );

        expect(base).toBe('http://localhost:3000');
    });

    it('descarta un protocolo reenviado que no es http ni https', () => {
        const base = publicBaseUrl(
            pedido({ 'x-forwarded-host': 'traspaso.forzalabs.online', 'x-forwarded-proto': 'javascript' }),
            undefined,
        );

        expect(base).toBe('https://traspaso.forzalabs.online');
    });
});
