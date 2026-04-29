import { describe, it, expect } from 'vitest';
import { Operation } from '../src/entities/Operation';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { Money } from '../src/value-objects/Money';

describe('Operation Entity', () => {
    const createTestOperation = (offerPrice = 2000) => {
        return Operation.create({
            buyerId: new UniqueEntityID(),
            sellerId: new UniqueEntityID(),
            listingId: new UniqueEntityID(),
            offerPrice: Money.fromFloat(offerPrice),
        });
    };

    describe('Creación', () => {
        it('should start in offer_sent status', () => {
            const operation = createTestOperation();
            expect(operation.status).toBe('offer_sent');
        });

        it('should not have commission data before accepting', () => {
            const operation = createTestOperation();
            expect(operation.finalPrice).toBeUndefined();
            expect(operation.buyerCommission).toBeUndefined();
            expect(operation.sellerCommission).toBeUndefined();
        });
    });

    describe('Modelo de comisión split 5%/5%', () => {
        it('should calculate split commission when offer is accepted', () => {
            const operation = createTestOperation(2000);

            operation.acceptOffer(Money.fromFloat(2000));

            // Precio acordado
            expect(operation.finalPrice?.getFloat()).toBe(2000);

            // Comisiones: 5% cada parte
            expect(operation.buyerCommission?.getFloat()).toBe(100);    // 5% de 2000
            expect(operation.sellerCommission?.getFloat()).toBe(100);   // 5% de 2000

            // Lo que paga el buyer: 2000 + 100 = 2100
            expect(operation.buyerPays?.getFloat()).toBe(2100);

            // Lo que recibe el seller: 2000 - 100 = 1900
            expect(operation.sellerReceives?.getFloat()).toBe(1900);

            // Lo que gana la plataforma: 100 + 100 = 200
            expect(operation.platformEarns?.getFloat()).toBe(200);
        });

        it('should calculate commission on negotiated price', () => {
            const operation = createTestOperation(5000);

            // El seller acepta por un precio negociado más bajo
            operation.acceptOffer(Money.fromFloat(4500));

            expect(operation.finalPrice?.getFloat()).toBe(4500);
            expect(operation.buyerCommission?.getFloat()).toBe(225);    // 5% de 4500
            expect(operation.sellerCommission?.getFloat()).toBe(225);   // 5% de 4500
            expect(operation.buyerPays?.getFloat()).toBe(4725);         // 4500 + 225
            expect(operation.sellerReceives?.getFloat()).toBe(4275);    // 4500 - 225
            expect(operation.platformEarns?.getFloat()).toBe(450);      // 225 + 225
        });
    });

    describe('Ciclo de vida completo', () => {
        it('should transition through the full happy path', () => {
            const operation = createTestOperation(2000);

            // 1. Seller acepta la oferta
            operation.acceptOffer(Money.fromFloat(2000));
            expect(operation.status).toBe('contract_pending');

            // 2. Se firma el contrato tripartito
            operation.signContract();
            expect(operation.status).toBe('contract_signed');

            // 3. Seller inicia transferencia del activo a la plataforma
            operation.initiateTransfer();
            expect(operation.status).toBe('transfer_in_progress');

            // 4. Plataforma confirma custodia del activo
            operation.confirmAssetCustody();
            expect(operation.status).toBe('asset_in_custody');

            // 5. Buyer paga a la plataforma (transferencia bancaria)
            operation.confirmBuyerPayment();
            expect(operation.status).toBe('payment_received');

            // 6. Plataforma paga al seller y transfiere activo al buyer
            operation.complete();
            expect(operation.status).toBe('completed');
            expect(operation.sellerReceives?.getFloat()).toBe(1900);
        });
    });

    describe('Transiciones inválidas', () => {
        it('should not accept offer if not in offer_sent or negotiating', () => {
            const operation = createTestOperation();
            operation.acceptOffer(Money.fromFloat(2000));
            operation.signContract();

            expect(() => operation.acceptOffer(Money.fromFloat(1500)))
                .toThrow('Solo se pueden aceptar ofertas en estado offer_sent o negotiating');
        });

        it('should not sign contract if not in contract_pending', () => {
            const operation = createTestOperation();

            expect(() => operation.signContract())
                .toThrow('Operación no está esperando contrato');
        });

        it('should not confirm custody without transfer in progress', () => {
            const operation = createTestOperation();
            operation.acceptOffer(Money.fromFloat(2000));
            operation.signContract();

            expect(() => operation.confirmAssetCustody())
                .toThrow('No hay transferencia en curso');
        });

        it('should not accept payment without asset in custody', () => {
            const operation = createTestOperation();
            operation.acceptOffer(Money.fromFloat(2000));
            operation.signContract();
            operation.initiateTransfer();

            expect(() => operation.confirmBuyerPayment())
                .toThrow('El activo debe estar en custodia de la plataforma antes del pago');
        });

        it('should not complete without payment received', () => {
            const operation = createTestOperation();
            operation.acceptOffer(Money.fromFloat(2000));
            operation.signContract();
            operation.initiateTransfer();
            operation.confirmAssetCustody();

            expect(() => operation.complete())
                .toThrow('El pago debe estar confirmado para completar la operación');
        });
    });

    describe('Cancelación', () => {
        it('should allow cancellation in offer_sent', () => {
            const operation = createTestOperation();
            operation.cancel();
            expect(operation.status).toBe('cancelled');
        });

        it('should allow cancellation in contract_pending', () => {
            const operation = createTestOperation();
            operation.acceptOffer(Money.fromFloat(2000));
            operation.cancel();
            expect(operation.status).toBe('cancelled');
        });

        it('should NOT allow cancellation after contract is signed', () => {
            const operation = createTestOperation();
            operation.acceptOffer(Money.fromFloat(2000));
            operation.signContract();

            expect(() => operation.cancel())
                .toThrow('No se puede cancelar una operación en estado contract_signed');
        });

        it('should NOT allow cancellation when asset is in custody', () => {
            const operation = createTestOperation();
            operation.acceptOffer(Money.fromFloat(2000));
            operation.signContract();
            operation.initiateTransfer();
            operation.confirmAssetCustody();

            expect(() => operation.cancel())
                .toThrow('No se puede cancelar una operación en estado asset_in_custody');
        });
    });
});
