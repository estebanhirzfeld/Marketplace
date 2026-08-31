import { describe, it, expect } from 'vitest';
import { Operation } from '../src/entities/Operation';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { Money } from '../src/value-objects/Money';

describe('Operation Entity', () => {
    const createTestOperation = (offerCents = 200000) => {
        return Operation.create({
            buyerId: new UniqueEntityID(),
            sellerId: new UniqueEntityID(),
            listingId: new UniqueEntityID(),
            offerPrice: Money.fromCents(offerCents, 'USD'),
        });
    };

    describe('Creación', () => {
        it('debería arrancar en offer_sent con la oferta inicial del buyer', () => {
            const operation = createTestOperation(200000); // $2000.00

            expect(operation.status).toBe('offer_sent');
            expect(operation.currentOfferPrice.getCents()).toBe(200000);
            expect(operation.pendingResponseFrom).toBe('seller');
            expect(operation.negotiations).toHaveLength(1);
            expect(operation.negotiations[0].proposedBy).toBe('buyer');
            expect(operation.negotiations[0].amount).toBe(200000);
        });

        it('no debería tener comisiones antes de aceptar', () => {
            const operation = createTestOperation();
            expect(operation.finalPrice).toBeUndefined();
            expect(operation.buyerCommission).toBeUndefined();
            expect(operation.sellerCommission).toBeUndefined();
        });
    });

    describe('Negociación (counterOffer)', () => {
        it('seller puede contraofertar la oferta del buyer', () => {
            const operation = createTestOperation(200000);

            operation.counterOffer(Money.fromCents(300000, 'USD'), 'seller');

            expect(operation.status).toBe('negotiating');
            expect(operation.currentOfferPrice.getCents()).toBe(300000);
            expect(operation.pendingResponseFrom).toBe('buyer');
            expect(operation.negotiations).toHaveLength(2);
        });

        it('buyer puede contraofertar la contraoferta del seller', () => {
            const operation = createTestOperation(200000);

            operation.counterOffer(Money.fromCents(300000, 'USD'), 'seller');
            operation.counterOffer(Money.fromCents(250000, 'USD'), 'buyer');

            expect(operation.status).toBe('negotiating');
            expect(operation.currentOfferPrice.getCents()).toBe(250000);
            expect(operation.pendingResponseFrom).toBe('seller');
            expect(operation.negotiations).toHaveLength(3);
        });

        it('múltiples rondas de negociación hasta acuerdo', () => {
            const operation = createTestOperation(100000); // Buyer: $1000

            operation.counterOffer(Money.fromCents(200000, 'USD'), 'seller'); // Seller: $2000
            operation.counterOffer(Money.fromCents(130000, 'USD'), 'buyer');  // Buyer: $1300
            operation.counterOffer(Money.fromCents(170000, 'USD'), 'seller'); // Seller: $1700
            operation.counterOffer(Money.fromCents(150000, 'USD'), 'buyer');  // Buyer: $1500
            operation.acceptCurrentOffer('seller');                            // Seller acepta $1500

            expect(operation.status).toBe('contract_pending');
            expect(operation.finalPrice?.getCents()).toBe(150000);
            expect(operation.negotiations).toHaveLength(5);
        });

        it('NO puede contraofertar quien hizo la última oferta', () => {
            const operation = createTestOperation(); // buyer ofreció

            expect(() => operation.counterOffer(Money.fromCents(150000, 'USD'), 'buyer'))
                .toThrow('No es el turno de buyer');
        });

        it('NO puede contraofertar en estados post-negociación', () => {
            const operation = createTestOperation();
            operation.acceptCurrentOffer('seller');

            expect(() => operation.counterOffer(Money.fromCents(150000, 'USD'), 'buyer'))
                .toThrow('Solo se puede negociar en estado offer_sent o negotiating');
        });
    });

    describe('Aceptación (acceptCurrentOffer)', () => {
        it('seller acepta la oferta directa del buyer', () => {
            const operation = createTestOperation(200000);

            operation.acceptCurrentOffer('seller');

            expect(operation.status).toBe('contract_pending');
            expect(operation.finalPrice?.getCents()).toBe(200000);
        });

        it('buyer acepta una contraoferta del seller', () => {
            const operation = createTestOperation(200000);
            operation.counterOffer(Money.fromCents(250000, 'USD'), 'seller');

            operation.acceptCurrentOffer('buyer');

            expect(operation.status).toBe('contract_pending');
            expect(operation.finalPrice?.getCents()).toBe(250000);
        });

        it('NO puede aceptar quien hizo la última oferta', () => {
            const operation = createTestOperation(); // buyer ofreció

            expect(() => operation.acceptCurrentOffer('buyer'))
                .toThrow('No es el turno de buyer');
        });

        it('NO puede aceptar en estados post-negociación', () => {
            const operation = createTestOperation();
            operation.acceptCurrentOffer('seller');
            operation.signContract();

            expect(() => operation.acceptCurrentOffer('buyer'))
                .toThrow('Solo se puede negociar en estado offer_sent o negotiating');
        });
    });

    describe('Modelo de comisión split 5%/5%', () => {
        it('debería calcular comisiones al aceptar oferta directa', () => {
            const operation = createTestOperation(200000); // $2000.00

            operation.acceptCurrentOffer('seller');

            expect(operation.finalPrice?.getFloat()).toBe(2000);
            expect(operation.buyerCommission?.getFloat()).toBe(100);    // 5% de 2000
            expect(operation.sellerCommission?.getFloat()).toBe(100);   // 5% de 2000
            expect(operation.buyerPays?.getFloat()).toBe(2100);         // 2000 + 100
            expect(operation.sellerReceives?.getFloat()).toBe(1900);    // 2000 - 100
            expect(operation.platformEarns?.getFloat()).toBe(200);      // 100 + 100
        });

        it('debería calcular comisiones sobre el precio negociado', () => {
            // El vendedor contraoferta por encima de lo ofrecido, que es la
            // única dirección con sentido: pedir menos de lo que ya le ofrecen
            // sería aceptar, y aceptar tiene su propia acción.
            const operation = createTestOperation(400000); // Buyer: $4000

            operation.counterOffer(Money.fromCents(450000, 'USD'), 'seller'); // Seller: $4500
            operation.acceptCurrentOffer('buyer'); // Buyer acepta $4500

            expect(operation.finalPrice?.getFloat()).toBe(4500);
            expect(operation.buyerCommission?.getFloat()).toBe(225);    // 5% de 4500
            expect(operation.sellerCommission?.getFloat()).toBe(225);   // 5% de 4500
            expect(operation.buyerPays?.getFloat()).toBe(4725);         // 4500 + 225
            expect(operation.sellerReceives?.getFloat()).toBe(4275);    // 4500 - 225
            expect(operation.platformEarns?.getFloat()).toBe(450);      // 225 + 225
        });
    });

    describe('Ciclo de vida completo', () => {
        it('debería transicionar por el happy path con negociación', () => {
            const operation = createTestOperation(200000);

            // 1. Negociación
            operation.counterOffer(Money.fromCents(300000, 'USD'), 'seller');
            operation.counterOffer(Money.fromCents(250000, 'USD'), 'buyer');
            operation.acceptCurrentOffer('seller'); // Acepta $2500
            expect(operation.status).toBe('contract_pending');

            // 2. Contrato
            operation.signContract();
            expect(operation.status).toBe('contract_signed');

            // 3. Transferencia
            operation.initiateTransfer();
            expect(operation.status).toBe('transfer_in_progress');

            // 4. Custodia
            operation.confirmAssetCustody({
                verifiedBy: new UniqueEntityID(),
                isPrimaryOwner: true,
                accessSecured: true,
                metrics: {},
            });
            expect(operation.status).toBe('asset_in_custody');

            // 5. Pago
            operation.confirmBuyerPayment(unPagoDe(operation));
            expect(operation.status).toBe('payment_received');

            // 6. Completar
            operation.complete();
            expect(operation.status).toBe('completed');
            expect(operation.sellerReceives?.getCents()).toBe(237500); // 250000 - 5%
        });
    });

    describe('Transiciones inválidas', () => {
        it('no debería firmar contrato sin aceptar oferta', () => {
            const operation = createTestOperation();

            expect(() => operation.signContract())
                .toThrow('Operación no está esperando contrato');
        });

        it('no debería confirmar custodia sin transfer en progreso', () => {
            const operation = createTestOperation();
            operation.acceptCurrentOffer('seller');
            operation.signContract();

            expect(() => operation.confirmAssetCustody({
                verifiedBy: new UniqueEntityID(),
                isPrimaryOwner: true,
                accessSecured: true,
                metrics: {},
            }))
                .toThrow('No hay transferencia en curso');
        });

        it('no debería aceptar pago sin activo en custodia', () => {
            const operation = createTestOperation();
            operation.acceptCurrentOffer('seller');
            operation.signContract();
            operation.initiateTransfer();

            expect(() => operation.confirmBuyerPayment(unPagoDe(operation)))
                .toThrow('El activo debe estar en custodia de la plataforma antes del pago');
        });

        it('no debería completar sin pago confirmado', () => {
            const operation = createTestOperation();
            operation.acceptCurrentOffer('seller');
            operation.signContract();
            operation.initiateTransfer();
            operation.confirmAssetCustody({
                verifiedBy: new UniqueEntityID(),
                isPrimaryOwner: true,
                accessSecured: true,
                metrics: {},
            });

            expect(() => operation.complete())
                .toThrow('El pago debe estar confirmado para completar la operación');
        });
    });

    describe('Cancelación', () => {
        it('debería permitir cancelación en offer_sent', () => {
            const operation = createTestOperation();
            operation.cancel();
            expect(operation.status).toBe('cancelled');
        });

        it('debería permitir cancelación durante negociación', () => {
            const operation = createTestOperation();
            operation.counterOffer(Money.fromCents(300000, 'USD'), 'seller');
            operation.cancel();
            expect(operation.status).toBe('cancelled');
        });

        it('debería permitir cancelación en contract_pending', () => {
            const operation = createTestOperation();
            operation.acceptCurrentOffer('seller');
            operation.cancel();
            expect(operation.status).toBe('cancelled');
        });

        it('NO debería permitir cancelación después de firmar contrato', () => {
            const operation = createTestOperation();
            operation.acceptCurrentOffer('seller');
            operation.signContract();

            expect(() => operation.cancel())
                .toThrow('No se puede cancelar una operación en estado contract_signed');
        });

        it('NO debería permitir cancelación con activo en custodia', () => {
            const operation = createTestOperation();
            operation.acceptCurrentOffer('seller');
            operation.signContract();
            operation.initiateTransfer();
            operation.confirmAssetCustody({
                verifiedBy: new UniqueEntityID(),
                isPrimaryOwner: true,
                accessSecured: true,
                metrics: {},
            });

            expect(() => operation.cancel())
                .toThrow('No se puede cancelar una operación en estado asset_in_custody');
        });
    });
});


/** El pago que una operación espera: exactamente lo que el comprador debe. */
function unPagoDe(op: Operation) {
    return {
        provider: 'transferencia' as const,
        method: 'transferencia_bancaria',
        amountCents: op.buyerPays!.getCents(),
        currency: op.buyerPays!.getCurrency(),
    };
}
