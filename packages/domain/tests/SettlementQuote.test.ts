import { describe, it, expect } from 'vitest';
import { SettlementQuote, QUOTE_TTL_MS } from '../src/value-objects/SettlementQuote';
import { Money } from '../src/value-objects/Money';
import { ValidationError } from '../src/errors/DomainError';

/**
 * La cotización en pesos de una operación en otra moneda.
 *
 * Mercado Pago cobra en pesos y su comisión de marketplace también. La
 * plataforma convierte por su cuenta, con una tasa conocida de antemano, y
 * congela el resultado: lo que el comprador paga y lo que el vendedor cobra
 * en pesos salen de acá, no de lo que decida la pasarela.
 */

const AHORA = new Date('2026-10-05T12:00:00Z');
const TASA = { rate: 1500, date: '2026-10-02', source: 'BCRA_A3500' as const };

function unaCotizacion(over: Partial<Parameters<typeof SettlementQuote.create>[0]> = {}) {
    return SettlementQuote.create({
        buyerPays: Money.fromCents(1_050_000, 'USD'),
        sellerReceives: Money.fromCents(950_000, 'USD'),
        exchangeRate: TASA,
        now: AHORA,
        ...over,
    });
}

describe('SettlementQuote.create', () => {
    it('convierte ambos montos a pesos con la tasa', () => {
        const q = unaCotizacion();

        expect(q.currency).toBe('ARS');
        expect(q.buyerPaysCents).toBe(1_575_000_000);
        expect(q.sellerReceivesCents).toBe(1_425_000_000);
    });

    it('la comisión es la diferencia, no una conversión aparte', () => {
        const q = unaCotizacion();

        expect(q.platformFeeCents).toBe(q.buyerPaysCents - q.sellerReceivesCents);
        expect(q.platformFeeCents).toBe(150_000_000);
    });

    it('redondea cada monto al centavo y el redondeo lo absorbe la plataforma', () => {
        const q = unaCotizacion({
            buyerPays: Money.fromCents(1_001, 'USD'),
            sellerReceives: Money.fromCents(999, 'USD'),
            exchangeRate: { rate: 1234.567, date: '2026-10-02', source: 'BCRA_A3500' },
        });

        expect(q.buyerPaysCents).toBe(Math.round(1_001 * 1234.567));
        expect(q.sellerReceivesCents).toBe(Math.round(999 * 1234.567));
        expect(q.platformFeeCents).toBe(q.buyerPaysCents - q.sellerReceivesCents);
        expect(Number.isInteger(q.buyerPaysCents)).toBe(true);
    });

    it('guarda la tasa, su fecha y su origen', () => {
        const q = unaCotizacion({ exchangeRate: { rate: 1500, date: '2026-10-02', source: 'manual' } });

        expect(q.rate).toBe(1500);
        expect(q.rateDate).toBe('2026-10-02');
        expect(q.source).toBe('manual');
    });

    it('vence a las 24 horas por defecto', () => {
        const q = unaCotizacion();

        expect(QUOTE_TTL_MS).toBe(24 * 60 * 60 * 1000);
        expect(q.expiresAt.getTime()).toBe(AHORA.getTime() + QUOTE_TTL_MS);
    });

    it('acepta una vigencia propia', () => {
        const q = unaCotizacion({ ttlMs: 1000 });

        expect(q.expiresAt.getTime()).toBe(AHORA.getTime() + 1000);
    });

    it.each([0, -1, NaN, Infinity])('rechaza la tasa %s', (rate) => {
        expect(() =>
            unaCotizacion({ exchangeRate: { rate, date: '2026-10-02', source: 'BCRA_A3500' } }),
        ).toThrow(ValidationError);
    });

    it('rechaza montos en pesos: no hay nada que convertir', () => {
        expect(() =>
            unaCotizacion({
                buyerPays: Money.fromCents(1_050_000, 'ARS'),
                sellerReceives: Money.fromCents(950_000, 'ARS'),
            }),
        ).toThrow(ValidationError);
    });

    it('rechaza una moneda de origen que no sea dólar', () => {
        expect(() =>
            unaCotizacion({
                buyerPays: Money.fromCents(1_050_000, 'EUR'),
                sellerReceives: Money.fromCents(950_000, 'EUR'),
            }),
        ).toThrow(ValidationError);
    });

    it('rechaza montos de monedas distintas', () => {
        expect(() =>
            unaCotizacion({ sellerReceives: Money.fromCents(950_000, 'EUR') }),
        ).toThrow(ValidationError);
    });

    it('rechaza una comisión que no sea positiva', () => {
        expect(() =>
            unaCotizacion({
                buyerPays: Money.fromCents(1_000, 'USD'),
                sellerReceives: Money.fromCents(1_000, 'USD'),
            }),
        ).toThrow(ValidationError);
    });
});

describe('SettlementQuote.isExpired', () => {
    it('está vigente hasta el instante de vencimiento', () => {
        const q = unaCotizacion();

        expect(q.isExpired(new Date(AHORA.getTime() + QUOTE_TTL_MS - 1))).toBe(false);
        expect(q.isExpired(new Date(AHORA.getTime() + QUOTE_TTL_MS))).toBe(true);
    });
});

describe('SettlementQuote.reconstitute', () => {
    it('rehidrata sin recalcular nada', () => {
        const original = unaCotizacion();
        const copia = SettlementQuote.reconstitute({
            rate: original.rate,
            rateDate: original.rateDate,
            source: original.source,
            currency: original.currency,
            buyerPaysCents: 7,
            sellerReceivesCents: 5,
            platformFeeCents: 2,
            expiresAt: original.expiresAt,
        });

        expect(copia.buyerPaysCents).toBe(7);
        expect(copia.platformFeeCents).toBe(2);
        expect(copia.expiresAt).toBe(original.expiresAt);
    });
});
