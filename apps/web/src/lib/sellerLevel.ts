import type { PlatformAccessStatusDto } from '@marketplace/api-contract';

/** Titularidad 1 + acceso 2 + Mercado Pago 1. El KYC es requisito, no suma. */
export const MAX_SELLER_LEVEL = 4;

const POINTS = { ownership: 1, access: 2, mercadoPago: 1 } as const;

/**
 * El acceso cuenta cuando la plataforma lo confirmó (espera o inmediata).
 * Con el aviso del vendedor todavía sin verificar no suma: sería una
 * promesa del vendedor, no un hecho comprobado.
 */
export function isAccessRegistered(status: PlatformAccessStatusDto): boolean {
    return status === 'waiting' || status === 'immediate';
}

export function sellerLevel(input: {
    ownershipVerified: boolean;
    accessRegistered: boolean;
    mercadoPagoLinked: boolean;
}): number {
    return (
        (input.ownershipVerified ? POINTS.ownership : 0) +
        (input.accessRegistered ? POINTS.access : 0) +
        (input.mercadoPagoLinked ? POINTS.mercadoPago : 0)
    );
}
