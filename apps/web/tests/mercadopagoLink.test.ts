import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
    createLinkAttempt,
    statesMatch,
    LINK_COOKIE,
    LINK_COOKIE_OPTIONS,
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
