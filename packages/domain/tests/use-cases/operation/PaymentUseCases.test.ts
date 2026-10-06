import { describe, it, expect, vi } from 'vitest';
import {
    ConfirmPaymentFromGatewayUseCase,
    CreateCheckoutUseCase,
} from '../../../src/use-cases/operation/PaymentUseCases';
import {
    IOperationRepository,
    ISellerPaymentAccountRepository,
    IUserRepository,
} from '../../../src/ports/Repositories';
import { ISellerAccessTokenSource } from '../../../src/ports/ISellerAccessTokenSource';
import { INotifier } from '../../../src/ports/INotifier';
import { PlatformNotifier } from '../../../src/services/PlatformNotifier';
import { SellerPaymentAccount } from '../../../src/entities/SellerPaymentAccount';
import { ExternalPayment, IPaymentGateway } from '../../../src/ports/IPaymentGateway';
import { ExchangeRate, IExchangeRateProvider } from '../../../src/ports/IExchangeRateProvider';
import { Actor } from '../../../src/ports/Actor';
import { Operation, OperationStatus } from '../../../src/entities/Operation';
import { User } from '../../../src/entities/User';
import { Email } from '../../../src/value-objects/Email';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import {
    ForbiddenError,
    InvalidStateError,
    NotFoundError,
    ValidationError,
} from '../../../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

const BUYER_ID = new UniqueEntityID();
const SELLER_ID = new UniqueEntityID();

const BUYER: Actor = { id: BUYER_ID.toString(), role: UserRole.BUYER };
const SELLER: Actor = { id: SELLER_ID.toString(), role: UserRole.SELLER };

function unaOperacion(hasta: OperationStatus = 'asset_in_custody', moneda = 'USD'): Operation {
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

function createMockOperationRepo(operation: Operation | null): IOperationRepository {
    return {
        findById: vi.fn().mockResolvedValue(operation),
        findByListing: vi.fn().mockResolvedValue([]),
        findByParty: vi.fn().mockResolvedValue([]),
        findByStatuses: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function createMockUserRepo(): IUserRepository {
    return {
        findById: vi.fn().mockResolvedValue(
            User.create({
                email: Email.create('comprador@example.com'),
                fullName: 'Un Comprador',
                dni: '20123456789',
                role: UserRole.BUYER,
                passwordHash: 'hash',
            }),
        ),
        findByEmail: vi.fn().mockResolvedValue(null),
        findByRole: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function unaPasarela(over: Partial<IPaymentGateway> = {}): IPaymentGateway {
    return {
        createCheckout: vi.fn().mockResolvedValue({ url: 'https://mp/checkout', externalId: 'pref-1' }),
        fetchPayment: vi.fn().mockResolvedValue(null),
        ...over,
    };
}

function unPagoExterno(over: Partial<ExternalPayment> = {}): ExternalPayment {
    return {
        externalId: '1234567890',
        status: 'approved',
        method: 'credit_card',
        amountCents: 1_050_000,
        currency: 'USD',
        externalReference: 'op-1',
        ...over,
    };
}

// ═════════════════════════════════════════════════════════

describe('CreateCheckoutUseCase', () => {
    function armar(operation: Operation | null, gateway = unaPasarela()) {
        return {
            uso: new CreateCheckoutUseCase(
                createMockOperationRepo(operation),
                createMockUserRepo(),
                gateway,
            ),
            gateway,
        };
    }

    it('devuelve el link de pago con el activo en custodia', async () => {
        const { uso } = armar(unaOperacion('asset_in_custody', 'ARS'));

        const checkout = await uso.execute('op-1', BUYER);

        expect(checkout.url).toBe('https://mp/checkout');
    });

    it('cobra exactamente lo que el comprador debe, con comisión incluida', async () => {
        const operation = unaOperacion('asset_in_custody', 'ARS');
        const { uso, gateway } = armar(operation);

        await uso.execute('op-1', BUYER);

        expect(gateway.createCheckout).toHaveBeenCalledWith(
            expect.objectContaining({
                amountCents: 1_050_000,
                currency: 'ARS',
                externalReference: operation.id.toString(),
            }),
        );
    });

    /**
     * Mercado Pago cobra en pesos aunque la preferencia esté en dólares y
     * convierte a su propio cambio: el pago llega en ARS y por un monto que la
     * operación no puede reconocer, así que `confirmBuyerPayment` lo rechaza y
     * la operación queda aceptando pagos. Se frena antes de generar el link.
     */
    it('rechaza generar el link de pago si la operación no es en pesos', async () => {
        const { uso, gateway } = armar(unaOperacion('asset_in_custody', 'USD'));

        await expect(uso.execute('op-1', BUYER)).rejects.toThrow(ValidationError);
        expect(gateway.createCheckout).not.toHaveBeenCalled();
    });

    describe('operación en dólares con cotización', () => {
        const AHORA = new Date('2026-10-05T12:00:00Z');
        const TASA: ExchangeRate = { rate: 1500, date: '2026-10-02', source: 'BCRA_A3500' };

        function armarConTasa(
            operation: Operation,
            rates?: IExchangeRateProvider,
            gateway = unaPasarela(),
        ) {
            const repo = createMockOperationRepo(operation);
            const uso = new CreateCheckoutUseCase(
                repo,
                createMockUserRepo(),
                gateway,
                rates,
                () => AHORA,
            );
            return { uso, repo, gateway };
        }

        function unProveedor(tasa: ExchangeRate | null): IExchangeRateProvider {
            return { getUsdArsRate: vi.fn().mockResolvedValue(tasa) };
        }

        it('cobra en pesos con la cotización y la guarda en la operación', async () => {
            const operation = unaOperacion('asset_in_custody', 'USD');
            const { uso, repo, gateway } = armarConTasa(operation, unProveedor(TASA));

            await uso.execute('op-1', BUYER);

            expect(gateway.createCheckout).toHaveBeenCalledWith(
                expect.objectContaining({ amountCents: 1_575_000_000, currency: 'ARS' }),
            );
            expect(operation.settlementQuote?.buyerPaysCents).toBe(1_575_000_000);
            expect(repo.save).toHaveBeenCalledWith(operation);
        });

        it('reutiliza la cotización vigente sin pedir otra tasa', async () => {
            const operation = unaOperacion('asset_in_custody', 'USD');
            const rates = unProveedor(TASA);
            const { uso, gateway } = armarConTasa(operation, rates);
            await uso.execute('op-1', BUYER);
            const primera = operation.settlementQuote;

            // Otra tasa distinta: no tiene que usarse mientras la primera esté vigente.
            (rates.getUsdArsRate as ReturnType<typeof vi.fn>).mockResolvedValue({
                ...TASA,
                rate: 1700,
            });
            await uso.execute('op-1', BUYER);

            expect(rates.getUsdArsRate).toHaveBeenCalledTimes(1);
            expect(operation.settlementQuote).toBe(primera);
            expect(gateway.createCheckout).toHaveBeenLastCalledWith(
                expect.objectContaining({ amountCents: 1_575_000_000 }),
            );
        });

        it('arma una cotización nueva si la anterior venció', async () => {
            const operation = unaOperacion('asset_in_custody', 'USD');
            const rates = unProveedor(TASA);
            let ahora = AHORA;
            const gateway = unaPasarela();
            const uso = new CreateCheckoutUseCase(
                createMockOperationRepo(operation),
                createMockUserRepo(),
                gateway,
                rates,
                () => ahora,
            );
            await uso.execute('op-1', BUYER);

            ahora = new Date(AHORA.getTime() + 25 * 60 * 60 * 1000);
            (rates.getUsdArsRate as ReturnType<typeof vi.fn>).mockResolvedValue({
                ...TASA,
                rate: 1600,
            });
            await uso.execute('op-1', BUYER);

            expect(rates.getUsdArsRate).toHaveBeenCalledTimes(2);
            expect(operation.settlementQuote?.rate).toBe(1600);
            expect(gateway.createCheckout).toHaveBeenLastCalledWith(
                expect.objectContaining({ amountCents: 1_680_000_000, currency: 'ARS' }),
            );
        });

        it('sin proveedor de tasas no genera el link', async () => {
            const { uso, gateway, repo } = armarConTasa(unaOperacion('asset_in_custody', 'USD'));

            await expect(uso.execute('op-1', BUYER)).rejects.toThrow(ValidationError);
            expect(gateway.createCheckout).not.toHaveBeenCalled();
            expect(repo.save).not.toHaveBeenCalled();
        });

        it('si el proveedor no tiene tasa no genera el link', async () => {
            const { uso, gateway, repo } = armarConTasa(
                unaOperacion('asset_in_custody', 'USD'),
                unProveedor(null),
            );

            await expect(uso.execute('op-1', BUYER)).rejects.toThrow(ValidationError);
            expect(gateway.createCheckout).not.toHaveBeenCalled();
            expect(repo.save).not.toHaveBeenCalled();
        });

        it('una operación en pesos no consulta tasas ni cotiza', async () => {
            const operation = unaOperacion('asset_in_custody', 'ARS');
            const rates = unProveedor(TASA);
            const { uso, repo } = armarConTasa(operation, rates);

            await uso.execute('op-1', BUYER);

            expect(rates.getUsdArsRate).not.toHaveBeenCalled();
            expect(operation.settlementQuote).toBeUndefined();
            expect(repo.save).not.toHaveBeenCalled();
        });
    });

    describe('con split de Mercado Pago (token del vendedor)', () => {
        const AHORA = new Date('2026-10-05T12:00:00Z');
        const TASA: ExchangeRate = { rate: 1500, date: '2026-10-02', source: 'BCRA_A3500' };

        function unOrigenDeTokens(
            resultado: () => Promise<string> = async () => 'APP_USR-del-vendedor',
        ): ISellerAccessTokenSource {
            return { execute: vi.fn(resultado) };
        }

        function armarSplit(
            operation: Operation,
            sellerTokens: ISellerAccessTokenSource,
            gateway = unaPasarela(),
        ) {
            const rates: IExchangeRateProvider = { getUsdArsRate: vi.fn().mockResolvedValue(TASA) };
            const uso = new CreateCheckoutUseCase(
                createMockOperationRepo(operation),
                createMockUserRepo(),
                gateway,
                rates,
                () => AHORA,
                sellerTokens,
            );
            return { uso, gateway };
        }

        it('en pesos cobra con el token del vendedor y retiene la comisión de la plataforma', async () => {
            const sellerTokens = unOrigenDeTokens();
            const { uso, gateway } = armarSplit(unaOperacion('asset_in_custody', 'ARS'), sellerTokens);

            await uso.execute('op-1', BUYER);

            expect(sellerTokens.execute).toHaveBeenCalledWith(SELLER_ID.toString());
            expect(gateway.createCheckout).toHaveBeenCalledWith(
                expect.objectContaining({
                    amountCents: 1_050_000,
                    currency: 'ARS',
                    sellerAccessToken: 'APP_USR-del-vendedor',
                    marketplaceFeeCents: 100_000,
                }),
            );
        });

        it('en pesos no fija vencimiento: solo las cotizaciones lo tienen', async () => {
            const { uso, gateway } = armarSplit(unaOperacion('asset_in_custody', 'ARS'), unOrigenDeTokens());

            await uso.execute('op-1', BUYER);

            const pedido = (gateway.createCheckout as ReturnType<typeof vi.fn>).mock.calls[0][0];
            expect(pedido.expiresAt).toBeUndefined();
        });

        it('en dólares cobra el monto y la comisión congelados y vence con la cotización', async () => {
            const operation = unaOperacion('asset_in_custody', 'USD');
            const { uso, gateway } = armarSplit(operation, unOrigenDeTokens());

            await uso.execute('op-1', BUYER);

            const quote = operation.settlementQuote!;
            expect(gateway.createCheckout).toHaveBeenCalledWith(
                expect.objectContaining({
                    amountCents: quote.buyerPaysCents,
                    currency: 'ARS',
                    sellerAccessToken: 'APP_USR-del-vendedor',
                    marketplaceFeeCents: quote.platformFeeCents,
                    expiresAt: quote.expiresAt,
                }),
            );
            expect(quote.platformFeeCents).toBeGreaterThan(0);
            expect(quote.platformFeeCents).toBeLessThan(quote.buyerPaysCents);
        });

        it('si el vendedor no vinculó Mercado Pago lo dice y no llama a la pasarela', async () => {
            const sellerTokens = unOrigenDeTokens(async () => {
                throw new NotFoundError('El vendedor no vinculó su cuenta de Mercado Pago.');
            });
            const { uso, gateway } = armarSplit(unaOperacion('asset_in_custody', 'ARS'), sellerTokens);

            const error = await uso.execute('op-1', BUYER).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(ValidationError);
            expect((error as Error).message).toBe(
                'El vendedor todavía no habilitó Mercado Pago para cobrar. Podés pagar por transferencia bancaria.',
            );
            expect(gateway.createCheckout).not.toHaveBeenCalled();
        });

        it('si no se pudo obtener o renovar el token lo dice y no llama a la pasarela', async () => {
            const sellerTokens = unOrigenDeTokens(async () => {
                throw new InvalidStateError('No pudimos renovar el permiso de Mercado Pago del vendedor.');
            });
            const { uso, gateway } = armarSplit(unaOperacion('asset_in_custody', 'ARS'), sellerTokens);

            const error = await uso.execute('op-1', BUYER).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(ValidationError);
            expect((error as Error).message).toBe(
                'Mercado Pago no está disponible para esta operación por ahora. Podés pagar por transferencia bancaria.',
            );
            expect(gateway.createCheckout).not.toHaveBeenCalled();
        });

        it('un error inesperado al obtener el token no se disfraza', async () => {
            const sellerTokens = unOrigenDeTokens(async () => {
                throw new Error('la base no responde');
            });
            const { uso, gateway } = armarSplit(unaOperacion('asset_in_custody', 'ARS'), sellerTokens);

            await expect(uso.execute('op-1', BUYER)).rejects.toThrow('la base no responde');
            expect(gateway.createCheckout).not.toHaveBeenCalled();
        });

        it('sin el origen de tokens el pedido no lleva token del vendedor ni comisión', async () => {
            const { uso, gateway } = armar(unaOperacion('asset_in_custody', 'ARS'));

            await uso.execute('op-1', BUYER);

            const pedido = (gateway.createCheckout as ReturnType<typeof vi.fn>).mock.calls[0][0];
            expect(Object.keys(pedido)).not.toContain('sellerAccessToken');
            expect(Object.keys(pedido)).not.toContain('marketplaceFeeCents');
            expect(Object.keys(pedido)).not.toContain('expiresAt');
        });
    });

    /**
     * La regla central del escrow: el activo entra antes de que se cobre. Se
     * hace cumplir acá y no solo en la entidad para no mandar a nadie a pagar
     * algo que después se va a rechazar.
     */
    it('rechaza generar el link si el activo no está en custodia', async () => {
        const { uso } = armar(unaOperacion('transfer_in_progress'));

        await expect(uso.execute('op-1', BUYER)).rejects.toThrow(InvalidStateError);
    });

    it('rechaza que el vendedor genere el pago', async () => {
        const { uso } = armar(unaOperacion());

        await expect(uso.execute('op-1', SELLER)).rejects.toThrow(ForbiddenError);
    });

    it('rechaza a quien no es parte', async () => {
        const { uso } = armar(unaOperacion());
        const ajeno: Actor = { id: new UniqueEntityID().toString(), role: UserRole.BUYER };

        await expect(uso.execute('op-1', ajeno)).rejects.toThrow(ForbiddenError);
    });
});

// ═════════════════════════════════════════════════════════

describe('ConfirmPaymentFromGatewayUseCase', () => {
    function armar(operation: Operation | null, pago: ExternalPayment | null) {
        const repo = createMockOperationRepo(operation);
        const gateway = unaPasarela({ fetchPayment: vi.fn().mockResolvedValue(pago) });
        return { uso: new ConfirmPaymentFromGatewayUseCase(repo, gateway), repo, gateway };
    }

    it('confirma el pago y avanza la operación', async () => {
        const operation = unaOperacion();
        const { uso, repo } = armar(operation, unPagoExterno());

        await uso.execute('1234567890');

        expect(operation.status).toBe('payment_received');
        expect(operation.payment?.externalId).toBe('1234567890');
        expect(operation.payment?.method).toBe('credit_card');
        expect(repo.save).toHaveBeenCalledOnce();
    });

    /**
     * Lo que hace segura la integración: del aviso solo se toma el id, y el
     * estado se pregunta a la pasarela con nuestras credenciales. Un aviso
     * falsificado no alcanza para dar por pagada una operación.
     */
    it('consulta el pago contra la pasarela en vez de creerle al aviso', async () => {
        const { uso, gateway } = armar(unaOperacion(), unPagoExterno());

        await uso.execute('1234567890');

        expect(gateway.fetchPayment).toHaveBeenCalledWith('1234567890');
    });

    it('no hace nada si la pasarela no conoce ese pago', async () => {
        const operation = unaOperacion();
        const { uso, repo } = armar(operation, null);

        await uso.execute('inventado');

        expect(operation.status).toBe('asset_in_custody');
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('no confirma un pago pendiente', async () => {
        const operation = unaOperacion();
        const { uso } = armar(operation, unPagoExterno({ status: 'pending' }));

        await uso.execute('1234567890');

        expect(operation.status).toBe('asset_in_custody');
    });

    it('no confirma un pago rechazado', async () => {
        const operation = unaOperacion();
        const { uso } = armar(operation, unPagoExterno({ status: 'rejected' }));

        await uso.execute('1234567890');

        expect(operation.status).toBe('asset_in_custody');
    });

    /** Las pasarelas reintentan sus avisos: repetirlo no puede romper nada. */
    it('es idempotente ante un aviso repetido', async () => {
        const operation = unaOperacion();
        const { uso, repo } = armar(operation, unPagoExterno());

        await uso.execute('1234567890');
        await uso.execute('1234567890');

        expect(operation.status).toBe('payment_received');
        expect(repo.save).toHaveBeenCalledOnce();
    });

    /** Un monto que no cierra no se acepta ni siquiera viniendo de la pasarela. */
    it('rechaza un pago por menos de lo debido', async () => {
        const operation = unaOperacion();
        const { uso } = armar(operation, unPagoExterno({ amountCents: 500_000 }));

        await expect(uso.execute('1234567890')).rejects.toThrow();
        expect(operation.status).toBe('asset_in_custody');
    });

    it('falla si el pago no corresponde a ninguna operación', async () => {
        const { uso } = armar(null, unPagoExterno());

        await expect(uso.execute('1234567890')).rejects.toThrow(NotFoundError);
    });

    describe('con split de Mercado Pago (el pago vive en la cuenta del vendedor)', () => {
        const MP_USER_ID = '987654';

        function unaCuenta(): SellerPaymentAccount {
            return SellerPaymentAccount.create({
                userId: SELLER_ID,
                mpUserId: MP_USER_ID,
                accessToken: 'APP_USR-viejo',
                refreshToken: 'TG-refresco',
                expiresAt: new Date('2030-01-01T00:00:00Z'),
                scope: 'offline_access read write',
                linkedAt: new Date('2026-09-01T00:00:00Z'),
            });
        }

        function armarSplit(over: { cuenta?: SellerPaymentAccount | null; conDeps?: boolean } = {}) {
            const { cuenta = unaCuenta(), conDeps = true } = over;
            const operation = unaOperacion();
            const repo = createMockOperationRepo(operation);
            const gateway = unaPasarela({ fetchPayment: vi.fn().mockResolvedValue(unPagoExterno()) });
            const accounts: ISellerPaymentAccountRepository = {
                findByUserId: vi.fn().mockResolvedValue(cuenta),
                findByMpUserId: vi.fn().mockResolvedValue(cuenta),
                existsByUserId: vi.fn().mockResolvedValue(cuenta !== null),
                save: vi.fn().mockResolvedValue(undefined),
                deleteByUserId: vi.fn().mockResolvedValue(undefined),
            };
            const sellerTokens: ISellerAccessTokenSource = {
                execute: vi.fn().mockResolvedValue('APP_USR-del-vendedor'),
            };
            const notifier: INotifier = { notify: vi.fn().mockResolvedValue(undefined) };
            const plataforma = new PlatformNotifier(notifier, createMockUserRepo());
            const payoutNeeded = vi.spyOn(plataforma, 'payoutNeeded');
            const uso = new ConfirmPaymentFromGatewayUseCase(
                repo,
                gateway,
                undefined,
                plataforma,
                conDeps ? sellerTokens : undefined,
                conDeps ? accounts : undefined,
            );
            return { uso, operation, gateway, accounts, sellerTokens, payoutNeeded };
        }

        it('con la pista del cobrador consulta el pago con el token de ese vendedor', async () => {
            const { uso, gateway, accounts, sellerTokens, operation } = armarSplit();

            await uso.execute('1234567890', { collectorMpUserId: MP_USER_ID });

            expect(accounts.findByMpUserId).toHaveBeenCalledWith(MP_USER_ID);
            expect(sellerTokens.execute).toHaveBeenCalledWith(SELLER_ID.toString());
            expect(gateway.fetchPayment).toHaveBeenCalledWith('1234567890', {
                accessToken: 'APP_USR-del-vendedor',
            });
            expect(operation.status).toBe('payment_received');
        });

        it('un pago con split no avisa la liquidación: Mercado Pago ya le pagó al vendedor', async () => {
            const { uso, payoutNeeded } = armarSplit();

            await uso.execute('1234567890', { collectorMpUserId: MP_USER_ID });

            expect(payoutNeeded).not.toHaveBeenCalled();
        });

        it('sin la pista consulta con el token de la plataforma y avisa la liquidación', async () => {
            const { uso, gateway, accounts, payoutNeeded } = armarSplit();

            await uso.execute('1234567890');

            expect(accounts.findByMpUserId).not.toHaveBeenCalled();
            expect(gateway.fetchPayment).toHaveBeenCalledWith('1234567890');
            expect(payoutNeeded).toHaveBeenCalledOnce();
        });

        it('con una pista que no corresponde a ninguna cuenta vuelve al camino de siempre', async () => {
            const { uso, gateway, sellerTokens, payoutNeeded } = armarSplit({ cuenta: null });

            await uso.execute('1234567890', { collectorMpUserId: 'desconocido' });

            expect(sellerTokens.execute).not.toHaveBeenCalled();
            expect(gateway.fetchPayment).toHaveBeenCalledWith('1234567890');
            expect(payoutNeeded).toHaveBeenCalledOnce();
        });

        it('sin las dependencias del split ignora la pista', async () => {
            const { uso, gateway, payoutNeeded } = armarSplit({ conDeps: false });

            await uso.execute('1234567890', { collectorMpUserId: MP_USER_ID });

            expect(gateway.fetchPayment).toHaveBeenCalledWith('1234567890');
            expect(payoutNeeded).toHaveBeenCalledOnce();
        });

        it('la conciliación sigue igual: rechaza un monto que no cierra', async () => {
            const { uso, gateway, operation } = armarSplit();
            (gateway.fetchPayment as ReturnType<typeof vi.fn>).mockResolvedValue(
                unPagoExterno({ amountCents: 500_000 }),
            );

            await expect(uso.execute('1234567890', { collectorMpUserId: MP_USER_ID })).rejects.toThrow();
            expect(operation.status).toBe('asset_in_custody');
        });
    });
});
