import type { PlatformAccessStatusDto } from '@marketplace/api-contract';

/** Titularidad 1 + acceso 2 + Mercado Pago 1. El KYC es requisito, no suma. */
export const MAX_SELLER_LEVEL = 4;

/**
 * Cómo está Mercado Pago para el vendedor. `unavailable` es cuando la API
 * responde 503 o la consulta falla: no se puede vincular, así que tampoco
 * se ofrece ni se cuenta.
 */
export type MercadoPagoState = 'linked' | 'not_linked' | 'unavailable';

/** Sin Mercado Pago disponible el techo es titularidad 1 + acceso 2. */
export function maxSellerLevel(mercadoPago: MercadoPagoState): number {
    return mercadoPago === 'unavailable' ? MAX_SELLER_LEVEL - POINTS.mercadoPago : MAX_SELLER_LEVEL;
}

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
    mercadoPago: MercadoPagoState;
}): number {
    return (
        (input.ownershipVerified ? POINTS.ownership : 0) +
        (input.accessRegistered ? POINTS.access : 0) +
        (input.mercadoPago === 'linked' ? POINTS.mercadoPago : 0)
    );
}

export type LevelRowKey = 'ownership' | 'access' | 'mercadoPago';

export interface LevelRow {
    key: LevelRowKey;
    label: string;
    points: number;
    done: boolean;
}

/**
 * Qué suma cada logro y cuáles ya están, para el desglose bajo el anillo. Sin
 * Mercado Pago disponible la fila no se ofrece: tampoco suma al máximo.
 */
export function levelBreakdown(input: {
    ownershipVerified: boolean;
    accessRegistered: boolean;
    mercadoPago: MercadoPagoState;
}): LevelRow[] {
    const rows: LevelRow[] = [
        { key: 'ownership', label: 'Titularidad', points: POINTS.ownership, done: input.ownershipVerified },
        { key: 'access', label: 'Acceso', points: POINTS.access, done: input.accessRegistered },
    ];
    if (input.mercadoPago !== 'unavailable') {
        rows.push({
            key: 'mercadoPago',
            label: 'Mercado Pago',
            points: POINTS.mercadoPago,
            done: input.mercadoPago === 'linked',
        });
    }
    return rows;
}
