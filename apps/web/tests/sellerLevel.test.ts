import { describe, it, expect } from 'vitest';
import { sellerLevel, isAccessRegistered, MAX_SELLER_LEVEL } from '@/lib/sellerLevel';

describe('sellerLevel', () => {
    const none = { ownershipVerified: false, accessRegistered: false, mercadoPagoLinked: false };

    it('arranca en 0 sin ninguna verificación', () => {
        expect(sellerLevel(none)).toBe(0);
    });

    it('la titularidad suma 1, el acceso 2 y Mercado Pago 1', () => {
        expect(sellerLevel({ ...none, ownershipVerified: true })).toBe(1);
        expect(sellerLevel({ ...none, accessRegistered: true })).toBe(2);
        expect(sellerLevel({ ...none, mercadoPagoLinked: true })).toBe(1);
    });

    it('suma en cualquier orden y llega al máximo', () => {
        expect(sellerLevel({ ownershipVerified: true, accessRegistered: true, mercadoPagoLinked: false })).toBe(3);
        expect(sellerLevel({ ownershipVerified: true, accessRegistered: true, mercadoPagoLinked: true })).toBe(
            MAX_SELLER_LEVEL,
        );
    });
});

describe('isAccessRegistered', () => {
    it('cuenta recién cuando el administrador confirmó el acceso', () => {
        expect(isAccessRegistered('pending')).toBe(false);
        expect(isAccessRegistered('verifying')).toBe(false);
        expect(isAccessRegistered('waiting')).toBe(true);
        expect(isAccessRegistered('immediate')).toBe(true);
    });
});
