import { describe, it, expect } from 'vitest';
import { Operation } from '../src/entities/Operation';
import { Money } from '../src/value-objects/Money';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { InvalidStateError, ValidationError } from '../src/errors/DomainError';

/**
 * La constancia del pago del comprador.
 *
 * Confirmar el pago era un botón sin registro de por dónde había entrado la
 * plata. Ahora exige decirlo, y el monto tiene que coincidir con lo que el
 * comprador debía: un pago por menos no cierra la obligación, y aceptarlo
 * dejaría a la plataforma entregando un activo que no terminó de cobrar.
 */

function unaOperacionEnCustodia(): Operation {
    const op = Operation.create({
        listingId: new UniqueEntityID(),
        buyerId: new UniqueEntityID(),
        sellerId: new UniqueEntityID(),
        offerPrice: Money.fromCents(1_000_000, 'USD'),
    });
    op.acceptCurrentOffer('seller');
    op.signContract();
    op.initiateTransfer();
    op.confirmAssetCustody({
        verifiedBy: new UniqueEntityID(),
        isPrimaryOwner: true,
        accessSecured: true,
        metrics: {},
    });
    return op;
}

function unPago(over: Partial<Parameters<Operation['confirmBuyerPayment']>[0]> = {}) {
    return {
        provider: 'mercadopago' as const,
        externalId: '1234567890',
        method: 'credit_card',
        // 1.000.000 + 5% de comisión del comprador.
        amountCents: 1_050_000,
        currency: 'USD',
        ...over,
    };
}

describe('Operation.confirmBuyerPayment — exige constancia', () => {
    it('registra por dónde entró el pago', () => {
        const op = unaOperacionEnCustodia();

        op.confirmBuyerPayment(unPago());

        expect(op.status).toBe('payment_received');
        expect(op.payment?.provider).toBe('mercadopago');
        expect(op.payment?.externalId).toBe('1234567890');
        expect(op.payment?.method).toBe('credit_card');
        expect(op.payment?.confirmedAt).toBeInstanceOf(Date);
    });

    it('acepta una transferencia registrada a mano', () => {
        const op = unaOperacionEnCustodia();

        op.confirmBuyerPayment(unPago({ provider: 'transferencia', externalId: undefined }));

        expect(op.payment?.provider).toBe('transferencia');
        expect(op.status).toBe('payment_received');
    });

    it('exige el identificador externo cuando el pago vino de una pasarela', () => {
        const op = unaOperacionEnCustodia();

        expect(() => op.confirmBuyerPayment(unPago({ externalId: undefined }))).toThrow(
            ValidationError,
        );
    });
});

describe('El monto tiene que cerrar', () => {
    /**
     * El caso que esto evita: dar por pagada una operación con un pago parcial
     * y liberar un activo que no terminó de cobrarse.
     */
    it('rechaza un pago por menos de lo que el comprador debía', () => {
        const op = unaOperacionEnCustodia();

        expect(() => op.confirmBuyerPayment(unPago({ amountCents: 900_000 }))).toThrow(
            ValidationError,
        );
        expect(op.status).toBe('asset_in_custody');
    });

    /** De más tampoco: es señal de que el pago no es de esta operación. */
    it('rechaza un pago por más de lo debido', () => {
        const op = unaOperacionEnCustodia();

        expect(() => op.confirmBuyerPayment(unPago({ amountCents: 2_000_000 }))).toThrow(
            ValidationError,
        );
    });

    it('rechaza un pago en otra moneda', () => {
        const op = unaOperacionEnCustodia();

        expect(() => op.confirmBuyerPayment(unPago({ currency: 'ARS' }))).toThrow(ValidationError);
    });
});

describe('Estado previo', () => {
    /** La regla de siempre: el activo entra en custodia antes de que se cobre. */
    it('sigue rechazando el pago si el activo no está en custodia', () => {
        const op = Operation.create({
            listingId: new UniqueEntityID(),
            buyerId: new UniqueEntityID(),
            sellerId: new UniqueEntityID(),
            offerPrice: Money.fromCents(1_000_000, 'USD'),
        });

        expect(() => op.confirmBuyerPayment(unPago())).toThrow(InvalidStateError);
    });

    it('no confirma el pago dos veces', () => {
        const op = unaOperacionEnCustodia();
        op.confirmBuyerPayment(unPago());

        expect(() => op.confirmBuyerPayment(unPago())).toThrow(InvalidStateError);
    });
});
