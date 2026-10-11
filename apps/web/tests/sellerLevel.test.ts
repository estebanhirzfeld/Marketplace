import { describe, it, expect } from 'vitest';
import { sellerLevel, isAccessRegistered, maxSellerLevel, MAX_SELLER_LEVEL } from '@/lib/sellerLevel';

describe('sellerLevel', () => {
    const none: Parameters<typeof sellerLevel>[0] = { ownershipVerified: false, accessRegistered: false, mercadoPago: 'not_linked' };

    it('arranca en 0 sin ninguna verificación', () => {
        expect(sellerLevel(none)).toBe(0);
    });

    it('la titularidad suma 1, el acceso 2 y Mercado Pago 1', () => {
        expect(sellerLevel({ ...none, ownershipVerified: true })).toBe(1);
        expect(sellerLevel({ ...none, accessRegistered: true })).toBe(2);
        expect(sellerLevel({ ...none, mercadoPago: 'linked' })).toBe(1);
    });

    it('suma en cualquier orden y llega al máximo', () => {
        expect(sellerLevel({ ownershipVerified: true, accessRegistered: true, mercadoPago: 'not_linked' })).toBe(3);
        expect(sellerLevel({ ownershipVerified: true, accessRegistered: true, mercadoPago: 'linked' })).toBe(
            MAX_SELLER_LEVEL,
        );
    });
});

describe('Mercado Pago no disponible', () => {
    const all = { ownershipVerified: true, accessRegistered: true };

    it('el máximo baja a 3 y vuelve a 4 cuando está disponible', () => {
        expect(maxSellerLevel('unavailable')).toBe(3);
        expect(maxSellerLevel('linked')).toBe(MAX_SELLER_LEVEL);
        expect(maxSellerLevel('not_linked')).toBe(MAX_SELLER_LEVEL);
    });

    it('no suma nada y titularidad más acceso ya alcanzan el máximo', () => {
        expect(sellerLevel({ ...all, mercadoPago: 'unavailable' })).toBe(3);
        expect(sellerLevel({ ...all, mercadoPago: 'not_linked' })).toBe(3);
        expect(sellerLevel({ ...all, mercadoPago: 'linked' })).toBe(4);
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
