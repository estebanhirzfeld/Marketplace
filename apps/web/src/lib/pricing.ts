import type { MoneyDto } from '@marketplace/api-contract';

/**
 * La comisión que paga el vendedor, en porcentaje. Espeja `COMMISSION_RATE` del
 * dominio, que no se importa acá: la web no depende del paquete de dominio.
 */
export const SELLER_COMMISSION_PERCENT = 5;

export type PriceDifference = {
    direction: 'above' | 'below' | 'equal';
    /** Siempre positivo; el sentido lo dice `direction`. */
    percent: number;
};

/**
 * Cuánto se aparta el precio pedido de la valuación, en porcentaje entero.
 *
 * Devuelve `null` cuando no hay con qué comparar (sin precio o sin valuación):
 * la vista no muestra nada antes que inventar un número. Una diferencia que
 * redondea a 0 % cuenta como igual.
 */
export function priceDifference(
    priceCents: number,
    estimateCents: number | null,
): PriceDifference | null {
    if (!Number.isFinite(priceCents) || priceCents <= 0) return null;
    if (estimateCents === null || !Number.isFinite(estimateCents) || estimateCents <= 0) return null;

    const percent = Math.round((Math.abs(priceCents - estimateCents) / estimateCents) * 100);
    if (percent === 0) return { direction: 'equal', percent: 0 };
    return { direction: priceCents > estimateCents ? 'above' : 'below', percent };
}

/**
 * La valuación solo se compara con el precio si están en la misma moneda. La
 * web no tiene cotización para convertir, y inventar una daría un porcentaje
 * falso: si no coinciden, no hay referencia comparable.
 */
export function comparableEstimate(estimate: MoneyDto | null, currency: string): MoneyDto | null {
    return estimate && estimate.currency === currency ? estimate : null;
}
