import { describe, it, expect } from 'vitest';
import { HmacOwnershipChallengeIssuer } from '../src/adapters/HmacOwnershipChallengeIssuer';

const SECRET = 'secreto-de-test-con-al-menos-32-caracteres';

describe('HmacOwnershipChallengeIssuer', () => {
    const issuer = new HmacOwnershipChallengeIssuer(SECRET);

    it('devuelve traspaso-verificacion= seguido de 24 caracteres hexadecimales', () => {
        expect(issuer.tokenFor('l-1', 'ejemplo.com')).toMatch(/^traspaso-verificacion=[0-9a-f]{24}$/);
    });

    it('es determinista: el mismo par da siempre el mismo valor', () => {
        expect(issuer.tokenFor('l-1', 'ejemplo.com')).toBe(issuer.tokenFor('l-1', 'ejemplo.com'));
    });

    it('cambia con el listing', () => {
        expect(issuer.tokenFor('l-1', 'ejemplo.com')).not.toBe(issuer.tokenFor('l-2', 'ejemplo.com'));
    });

    it('cambia con el dominio', () => {
        expect(issuer.tokenFor('l-1', 'ejemplo.com')).not.toBe(issuer.tokenFor('l-1', 'otro.com'));
    });

    it('cambia con el secreto', () => {
        const otro = new HmacOwnershipChallengeIssuer('otro-secreto-igualmente-largo-0123456789');
        expect(otro.tokenFor('l-1', 'ejemplo.com')).not.toBe(issuer.tokenFor('l-1', 'ejemplo.com'));
    });

    it('no admite un secreto vacío', () => {
        expect(() => new HmacOwnershipChallengeIssuer('')).toThrow();
        expect(() => new HmacOwnershipChallengeIssuer('   ')).toThrow();
    });

    it('exige al menos 32 caracteres y sugiere cómo generarlo', () => {
        expect(() => new HmacOwnershipChallengeIssuer('corto')).toThrow(/openssl rand -hex 32/);
        expect(() => new HmacOwnershipChallengeIssuer('a'.repeat(31))).toThrow(/32/);
        expect(() => new HmacOwnershipChallengeIssuer(` ${'a'.repeat(31)} `)).toThrow(/32/);
    });

    it('acepta un secreto de exactamente 32 caracteres', () => {
        expect(() => new HmacOwnershipChallengeIssuer('a'.repeat(32))).not.toThrow();
    });
});
