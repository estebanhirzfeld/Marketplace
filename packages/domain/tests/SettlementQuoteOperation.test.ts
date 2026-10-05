import { describe, it, expect } from 'vitest';
import { Operation, OperationStatus } from '../src/entities/Operation';
import { SettlementQuote } from '../src/value-objects/SettlementQuote';
import { Money } from '../src/value-objects/Money';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { InvalidStateError, ValidationError } from '../src/errors/DomainError';

/**
 * La cotización congelada dentro de la operación.
 *
 * Una operación en dólares se cobra en pesos: la cotización fija cuánto tiene
 * que llegar, y `confirmBuyerPayment` compara contra eso y no contra el monto
 * en la moneda original.
 */

const AHORA = new Date('2026-10-05T12:00:00Z');

function unaOperacion(hasta: OperationStatus = 'asset_in_custody', moneda = 'USD'): Operation {
    const sellerId = new UniqueEntityID();
    const op = Operation.create({
        listingId: new UniqueEntityID(),
        buyerId: new UniqueEntityID(),
        sellerId,
        offerPrice: Money.fromCents(1_000_000, moneda),
    });
    op.acceptCurrentOffer('seller');
    if (hasta === 'contract_pending') return op;
    op.signContract();
    if (hasta === 'contract_signed') return op;
    op.initiateTransfer({ declaredBy: sellerId, controlCeded: true });
    if (hasta === 'transfer_in_progress') return op;
    op.confirmAssetCustody({
        verifiedBy: new UniqueEntityID(),
        isPrimaryOwner: true,
        accessSecured: true,
        metrics: {},
    });
    return op;
}

function unaCotizacion(op: Operation, rate = 1500, now = AHORA): SettlementQuote {
    return SettlementQuote.create({
        buyerPays: op.buyerPays!,
        sellerReceives: op.sellerReceives!,
        exchangeRate: { rate, date: '2026-10-02', source: 'BCRA_A3500' },
        now,
    });
}

function unPagoEnPesos(over: Partial<Parameters<Operation['confirmBuyerPayment']>[0]> = {}) {
    return {
        provider: 'mercadopago' as const,
        externalId: '1234567890',
        method: 'credit_card',
        // 1.050.000 centavos de dólar por 1500.
        amountCents: 1_575_000_000,
        currency: 'ARS',
        ...over,
    };
}

describe('Operation.quoteSettlement', () => {
    it('guarda la cotización', () => {
        const op = unaOperacion();
        const q = unaCotizacion(op);

        op.quoteSettlement(q);

        expect(op.settlementQuote).toBe(q);
    });

    it('sin cotización, el getter devuelve undefined', () => {
        expect(unaOperacion().settlementQuote).toBeUndefined();
    });

    it('reemplaza la cotización anterior', () => {
        const op = unaOperacion();
        op.quoteSettlement(unaCotizacion(op, 1500));
        const nueva = unaCotizacion(op, 1600);

        op.quoteSettlement(nueva);

        expect(op.settlementQuote).toBe(nueva);
    });

    it('exige el activo en custodia', () => {
        const op = unaOperacion('transfer_in_progress');
        const q = unaCotizacion(op);

        expect(() => op.quoteSettlement(q)).toThrow(InvalidStateError);
    });

    it('rechaza cotizar una operación que ya está en pesos', () => {
        const q = unaCotizacion(unaOperacion());
        const enPesos = unaOperacion('asset_in_custody', 'ARS');

        expect(() => enPesos.quoteSettlement(q)).toThrow(InvalidStateError);
    });

    it('rehidratar conserva la cotización tal cual', () => {
        const op = unaOperacion();
        const q = unaCotizacion(op);
        op.quoteSettlement(q);

        const copia = Operation.reconstitute({ ...op.toSnapshot().props }, op.id, op.createdAt);

        expect(copia.settlementQuote).toBe(q);
    });
});

describe('Operation.confirmBuyerPayment con cotización', () => {
    it('acepta el pago en pesos por el monto congelado', () => {
        const op = unaOperacion();
        op.quoteSettlement(unaCotizacion(op));

        op.confirmBuyerPayment(unPagoEnPesos());

        expect(op.status).toBe('payment_received');
        expect(op.payment?.currency).toBe('ARS');
    });

    it('rechaza otro monto en pesos', () => {
        const op = unaOperacion();
        op.quoteSettlement(unaCotizacion(op));

        expect(() => op.confirmBuyerPayment(unPagoEnPesos({ amountCents: 1_574_999_999 }))).toThrow(
            ValidationError,
        );
        expect(op.status).toBe('asset_in_custody');
    });

    it('rechaza el monto original en dólares', () => {
        const op = unaOperacion();
        op.quoteSettlement(unaCotizacion(op));

        expect(() =>
            op.confirmBuyerPayment(unPagoEnPesos({ amountCents: 1_050_000, currency: 'USD' })),
        ).toThrow(ValidationError);
    });

    it('rechaza otra moneda aunque el monto coincida', () => {
        const op = unaOperacion();
        op.quoteSettlement(unaCotizacion(op));

        expect(() => op.confirmBuyerPayment(unPagoEnPesos({ currency: 'USD' }))).toThrow(
            ValidationError,
        );
    });

    it('acepta un pago que llega con la cotización ya vencida', () => {
        const op = unaOperacion();
        // El vencimiento es de la preferencia de pago, no del dinero ya cobrado.
        op.quoteSettlement(unaCotizacion(op, 1500, new Date('2020-01-01T00:00:00Z')));

        op.confirmBuyerPayment(unPagoEnPesos());

        expect(op.status).toBe('payment_received');
    });

    it('sigue exigiendo la custodia antes del pago', () => {
        const op = unaOperacion('transfer_in_progress');

        expect(() => op.confirmBuyerPayment(unPagoEnPesos())).toThrow(InvalidStateError);
    });

    it('sin cotización conserva el comportamiento anterior', () => {
        const op = unaOperacion();

        op.confirmBuyerPayment(unPagoEnPesos({ amountCents: 1_050_000, currency: 'USD' }));

        expect(op.status).toBe('payment_received');
    });
});
