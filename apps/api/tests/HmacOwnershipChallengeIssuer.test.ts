import { describe, it, expect } from 'vitest';
import { HmacOwnershipChallengeIssuer } from '../src/adapters/HmacOwnershipChallengeIssuer';

describe('HmacOwnershipChallengeIssuer', () => {
    const issuer = new HmacOwnershipChallengeIssuer('secreto-de-test');

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
        const otro = new HmacOwnershipChallengeIssuer('otro-secreto');
        expect(otro.tokenFor('l-1', 'ejemplo.com')).not.toBe(issuer.tokenFor('l-1', 'ejemplo.com'));
    });

    it('no admite un secreto vacío', () => {
        expect(() => new HmacOwnershipChallengeIssuer('')).toThrow();
        expect(() => new HmacOwnershipChallengeIssuer('   ')).toThrow();
    });
});
