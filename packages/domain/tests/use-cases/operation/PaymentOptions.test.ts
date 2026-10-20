import { describe, it, expect, vi } from 'vitest';
import {
    GetPaymentOptionsUseCase,
    PaymentOptionsDeps,
} from '../../../src/use-cases/operation/GetPaymentOptionsUseCase';
import {
    IOperationRepository,
    ISellerPaymentAccountRepository,
} from '../../../src/ports/Repositories';
import { ExchangeRate, IExchangeRateProvider } from '../../../src/ports/IExchangeRateProvider';
import { Actor } from '../../../src/ports/Actor';
import { Operation, OperationStatus } from '../../../src/entities/Operation';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import {
    ForbiddenError,
    InvalidStateError,
    NotFoundError,
} from '../../../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

const BUYER_ID = new UniqueEntityID();
const SELLER_ID = new UniqueEntityID();

const BUYER: Actor = { id: BUYER_ID.toString(), role: UserRole.BUYER };
const SELLER: Actor = { id: SELLER_ID.toString(), role: UserRole.SELLER };
const ADMIN: Actor = { id: new UniqueEntityID().toString(), role: UserRole.ADMIN };
const STRANGER: Actor = { id: new UniqueEntityID().toString(), role: UserRole.BUYER };

const RATE: ExchangeRate = { rate: 1500, date: '2026-10-02', source: 'BCRA_A3500' };

function unaOperacion(hasta: OperationStatus = 'asset_in_custody', moneda = 'ARS'): Operation {
    const op = Operation.create({
        listingId: new UniqueEntityID(),
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        offerPrice: Money.fromCents(1_000_000, moneda),
    });
    op.acceptCurrentOffer('seller');
    if (hasta === 'contract_pending') return op;

    op.signContract();
    if (hasta === 'contract_signed') return op;

    op.initiateTransfer({ declaredBy: SELLER_ID, controlCeded: true });
    if (hasta === 'transfer_in_progress') return op;

    op.confirmAssetCustody({
        verifiedBy: new UniqueEntityID(),
        isPrimaryOwner: true,
        accessSecured: true,
        metrics: {},
    });
    return op;
}

function unRepo(operation: Operation | null): IOperationRepository {
    return {
        findById: vi.fn().mockResolvedValue(operation),
        findByListing: vi.fn().mockResolvedValue([]),
        findByParty: vi.fn().mockResolvedValue([]),
        findByStatuses: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function unRepoDeCuentas(linked: boolean): ISellerPaymentAccountRepository {
    return {
        findByUserId: vi.fn().mockRejectedValue(new Error('no debe descifrar tokens')),
        existsByUserId: vi.fn().mockResolvedValue(linked),
        findByMpUserId: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockResolvedValue(undefined),
        deleteByUserId: vi.fn().mockResolvedValue(undefined),
    };
}

function unProveedor(tasa: ExchangeRate | null): IExchangeRateProvider {
    return { getUsdArsRate: vi.fn().mockResolvedValue(tasa) };
}

function armar(operation: Operation | null, over: Partial<PaymentOptionsDeps> = {}) {
    const operationRepo = unRepo(operation);
    const deps: PaymentOptionsDeps = {
        mercadoPagoEnabled: true,
        splitEnabled: false,
        transferInstructions: { ARS: 'Banco Ejemplo\nCBU 000', USD: 'Cuenta en dólares' },
        ...over,
    };
    return { uso: new GetPaymentOptionsUseCase(operationRepo, deps), operationRepo };
}

describe('GetPaymentOptionsUseCase', () => {
    describe('quién puede preguntar y cuándo', () => {
        it('rechaza a un tercero', async () => {
            const { uso } = armar(unaOperacion());
            await expect(uso.execute('op-1', STRANGER)).rejects.toThrow(ForbiddenError);
        });

        it('responde al comprador, al vendedor y a un admin', async () => {
            const { uso } = armar(unaOperacion());
            for (const actor of [BUYER, SELLER, ADMIN]) {
                const result = await uso.execute('op-1', actor);
                expect(result.currency).toBe('ARS');
            }
        });

        it('falla si la operación no existe', async () => {
            const { uso } = armar(null);
            await expect(uso.execute('op-1', BUYER)).rejects.toThrow(NotFoundError);
        });

        it.each<OperationStatus>(['contract_pending', 'contract_signed', 'transfer_in_progress'])(
            'rechaza si la operación está en %s',
            async (estado) => {
                const { uso } = armar(unaOperacion(estado));
                await expect(uso.execute('op-1', BUYER)).rejects.toThrow(InvalidStateError);
            },
        );

        it('rechaza una operación ya pagada', async () => {
            const op = unaOperacion();
            op.confirmBuyerPayment({
                provider: 'transferencia',
                method: 'transfer',
                amountCents: 1_050_000,
                currency: 'ARS',
            });
            const { uso } = armar(op);
            await expect(uso.execute('op-1', BUYER)).rejects.toThrow(InvalidStateError);
        });
    });

    describe('monto', () => {
        it('informa lo que paga el comprador, comisión incluida, en la moneda de la operación', async () => {
            const { uso } = armar(unaOperacion('asset_in_custody', 'ARS'));
            const result = await uso.execute('op-1', BUYER);
            expect(result.amount).toEqual({ cents: 1_050_000, currency: 'ARS' });
            expect(result.currency).toBe('ARS');
        });

        it('informa el monto en dólares sin convertir', async () => {
            const { uso } = armar(unaOperacion('asset_in_custody', 'USD'), {
                rates: unProveedor(RATE),
            });
            const result = await uso.execute('op-1', BUYER);
            expect(result.amount).toEqual({ cents: 1_050_000, currency: 'USD' });
        });
    });

    describe('Mercado Pago', () => {
        it('está disponible en pesos sin split y no está convertido', async () => {
            const { uso } = armar(unaOperacion());
            const { mercadopago } = await uso.execute('op-1', BUYER);
            expect(mercadopago).toEqual({ available: true, chargedIn: 'ARS', converted: false });
        });

        it('no está disponible sin la pasarela configurada', async () => {
            const { uso } = armar(unaOperacion(), { mercadoPagoEnabled: false });
            const { mercadopago } = await uso.execute('op-1', BUYER);
            expect(mercadopago.available).toBe(false);
            expect(mercadopago.reason).toBe('not_configured');
        });

        it('con split y vendedor vinculado está disponible, sin descifrar tokens', async () => {
            const accounts = unRepoDeCuentas(true);
            const { uso } = armar(unaOperacion(), { splitEnabled: true, paymentAccounts: accounts });

            const { mercadopago } = await uso.execute('op-1', BUYER);

            expect(mercadopago.available).toBe(true);
            expect(accounts.existsByUserId).toHaveBeenCalledWith(SELLER_ID.toString());
            expect(accounts.findByUserId).not.toHaveBeenCalled();
        });

        it('con split y vendedor sin vincular informa seller_not_linked', async () => {
            const accounts = unRepoDeCuentas(false);
            const { uso } = armar(unaOperacion(), { splitEnabled: true, paymentAccounts: accounts });

            const { mercadopago } = await uso.execute('op-1', BUYER);

            expect(mercadopago.available).toBe(false);
            expect(mercadopago.reason).toBe('seller_not_linked');
            expect(accounts.findByUserId).not.toHaveBeenCalled();
        });

        it('con split y sin repositorio de cuentas informa seller_not_linked', async () => {
            const { uso } = armar(unaOperacion(), { splitEnabled: true });
            const { mercadopago } = await uso.execute('op-1', BUYER);
            expect(mercadopago.reason).toBe('seller_not_linked');
        });

        it('sin split no consulta la cuenta del vendedor', async () => {
            const accounts = unRepoDeCuentas(false);
            const { uso } = armar(unaOperacion(), { splitEnabled: false, paymentAccounts: accounts });

            const { mercadopago } = await uso.execute('op-1', BUYER);

            expect(mercadopago.available).toBe(true);
            expect(accounts.existsByUserId).not.toHaveBeenCalled();
        });

        it('sin pasarela no consulta la cuenta del vendedor y gana not_configured', async () => {
            const accounts = unRepoDeCuentas(false);
            const { uso } = armar(unaOperacion(), {
                mercadoPagoEnabled: false,
                splitEnabled: true,
                paymentAccounts: accounts,
            });

            const { mercadopago } = await uso.execute('op-1', BUYER);

            expect(mercadopago.reason).toBe('not_configured');
            expect(accounts.existsByUserId).not.toHaveBeenCalled();
        });

        describe('operación en dólares', () => {
            it('con tasa disponible está disponible y se cobra convertida en pesos', async () => {
                const { uso } = armar(unaOperacion('asset_in_custody', 'USD'), {
                    rates: unProveedor(RATE),
                });
                const { mercadopago } = await uso.execute('op-1', BUYER);
                expect(mercadopago).toEqual({ available: true, chargedIn: 'ARS', converted: true });
            });

            it('sin tasa (proveedor devuelve null) informa rate_unavailable', async () => {
                const { uso } = armar(unaOperacion('asset_in_custody', 'USD'), {
                    rates: unProveedor(null),
                });
                const { mercadopago } = await uso.execute('op-1', BUYER);
                expect(mercadopago.available).toBe(false);
                expect(mercadopago.reason).toBe('rate_unavailable');
                expect(mercadopago.converted).toBe(true);
            });

            it('sin proveedor de tasas informa rate_unavailable', async () => {
                const { uso } = armar(unaOperacion('asset_in_custody', 'USD'));
                const { mercadopago } = await uso.execute('op-1', BUYER);
                expect(mercadopago.reason).toBe('rate_unavailable');
            });

            it('con split, vinculado y con tasa está disponible', async () => {
                const { uso } = armar(unaOperacion('asset_in_custody', 'USD'), {
                    splitEnabled: true,
                    paymentAccounts: unRepoDeCuentas(true),
                    rates: unProveedor(RATE),
                });
                const { mercadopago } = await uso.execute('op-1', BUYER);
                expect(mercadopago.available).toBe(true);
            });

            it('con split, sin vincular y con tasa informa seller_not_linked', async () => {
                const { uso } = armar(unaOperacion('asset_in_custody', 'USD'), {
                    splitEnabled: true,
                    paymentAccounts: unRepoDeCuentas(false),
                    rates: unProveedor(RATE),
                });
                const { mercadopago } = await uso.execute('op-1', BUYER);
                expect(mercadopago.reason).toBe('seller_not_linked');
            });

            it('con split, vinculado y sin tasa informa rate_unavailable', async () => {
                const { uso } = armar(unaOperacion('asset_in_custody', 'USD'), {
                    splitEnabled: true,
                    paymentAccounts: unRepoDeCuentas(true),
                    rates: unProveedor(null),
                });
                const { mercadopago } = await uso.execute('op-1', BUYER);
                expect(mercadopago.reason).toBe('rate_unavailable');
            });

            it('sin pasarela informa not_configured aunque haya tasa', async () => {
                const rates = unProveedor(RATE);
                const { uso } = armar(unaOperacion('asset_in_custody', 'USD'), {
                    mercadoPagoEnabled: false,
                    rates,
                });
                const { mercadopago } = await uso.execute('op-1', BUYER);
                expect(mercadopago.reason).toBe('not_configured');
                expect(rates.getUsdArsRate).not.toHaveBeenCalled();
            });
        });

        it('en pesos no consulta la tasa', async () => {
            const rates = unProveedor(RATE);
            const { uso } = armar(unaOperacion('asset_in_custody', 'ARS'), { rates });
            await uso.execute('op-1', BUYER);
            expect(rates.getUsdArsRate).not.toHaveBeenCalled();
        });
    });

    describe('transferencia', () => {
        it('usa el texto de la moneda de la operación y como referencia el id', async () => {
            const op = unaOperacion('asset_in_custody', 'ARS');
            const { uso } = armar(op);
            const { transfer } = await uso.execute('op-1', BUYER);
            expect(transfer).toEqual({
                available: true,
                instructions: 'Banco Ejemplo\nCBU 000',
                reference: op.id.toString(),
            });
        });

        it('en dólares usa el texto de USD', async () => {
            const { uso } = armar(unaOperacion('asset_in_custody', 'USD'), {
                rates: unProveedor(RATE),
            });
            const { transfer } = await uso.execute('op-1', BUYER);
            expect(transfer.instructions).toBe('Cuenta en dólares');
        });

        it('no está disponible si falta el texto de esa moneda', async () => {
            const op = unaOperacion('asset_in_custody', 'USD');
            const { uso } = armar(op, { transferInstructions: { ARS: 'solo pesos' } });
            const { transfer } = await uso.execute('op-1', BUYER);
            expect(transfer.available).toBe(false);
            expect(transfer.instructions).toBeUndefined();
            expect(transfer.reference).toBe(op.id.toString());
        });

        it('un texto en blanco cuenta como ausente', async () => {
            const { uso } = armar(unaOperacion(), { transferInstructions: { ARS: '   \n ' } });
            const { transfer } = await uso.execute('op-1', BUYER);
            expect(transfer.available).toBe(false);
            expect(transfer.instructions).toBeUndefined();
        });

        it('las instrucciones llegan al comprador y al admin', async () => {
            const { uso } = armar(unaOperacion());
            for (const actor of [BUYER, ADMIN]) {
                const { transfer } = await uso.execute('op-1', actor);
                expect(transfer.instructions).toBe('Banco Ejemplo\nCBU 000');
            }
        });

        /**
         * El vendedor no paga ni confirma nada: no tiene qué hacer con los
         * datos bancarios de la plataforma. Se entera de que hay transferencia
         * disponible, pero no recibe el texto.
         */
        it('el vendedor sabe que hay transferencia pero no recibe las instrucciones', async () => {
            const { uso } = armar(unaOperacion());
            const { transfer } = await uso.execute('op-1', SELLER);
            expect(transfer.available).toBe(true);
            expect(transfer.instructions).toBeUndefined();
        });

        it('una moneda sin texto en ningún lado deja la transferencia no disponible', async () => {
            const { uso } = armar(unaOperacion(), { transferInstructions: {} });
            const { transfer } = await uso.execute('op-1', BUYER);
            expect(transfer.available).toBe(false);
        });
    });
});
