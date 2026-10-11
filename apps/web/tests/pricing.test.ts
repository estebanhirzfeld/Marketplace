import { describe, it, expect } from 'vitest';
import { priceDifference, comparableEstimate, SELLER_COMMISSION_PERCENT } from '@/lib/pricing';

describe('priceDifference', () => {
    it('un precio por encima de la valuación es positivo y redondea al entero', () => {
        expect(priceDifference(130_00, 100_00)).toEqual({ direction: 'above', percent: 30 });
        expect(priceDifference(112_40, 100_00)).toEqual({ direction: 'above', percent: 12 });
    });

    it('un precio por debajo es una diferencia hacia abajo, en positivo', () => {
        expect(priceDifference(80_00, 100_00)).toEqual({ direction: 'below', percent: 20 });
    });

    it('un precio igual, o que redondea a 0 %, es igual', () => {
        expect(priceDifference(100_00, 100_00)).toEqual({ direction: 'equal', percent: 0 });
        expect(priceDifference(100_20, 100_00)).toEqual({ direction: 'equal', percent: 0 });
    });

    it('sin precio, sin valuación o con valuación cero no hay comparación', () => {
        expect(priceDifference(0, 100_00)).toBeNull();
        expect(priceDifference(100_00, 0)).toBeNull();
        expect(priceDifference(100_00, null)).toBeNull();
        expect(priceDifference(Number.NaN, 100_00)).toBeNull();
    });
});

describe('comparableEstimate', () => {
    const usd = { cents: 100_00, currency: 'USD' };

    it('devuelve la valuación cuando está en la moneda elegida', () => {
        expect(comparableEstimate(usd, 'USD')).toBe(usd);
    });

    it('no convierte: en otra moneda no hay referencia comparable', () => {
        expect(comparableEstimate(usd, 'ARS')).toBeNull();
        expect(comparableEstimate(null, 'USD')).toBeNull();
    });
});

describe('comisión', () => {
    it('es el 5 % del vendedor', () => {
        expect(SELLER_COMMISSION_PERCENT).toBe(5);
    });
});
