import { describe, it, expect, vi } from 'vitest';
import {
    ConfirmPaymentFromGatewayUseCase,
    CreateCheckoutUseCase,
} from '../../../src/use-cases/operation/PaymentUseCases';
import { IOperationRepository, IUserRepository } from '../../../src/ports/Repositories';
import { ExternalPayment, IPaymentGateway } from '../../../src/ports/IPaymentGateway';
import { Actor } from '../../../src/ports/Actor';
import { Operation, OperationStatus } from '../../../src/entities/Operation';
import { User } from '../../../src/entities/User';
import { Email } from '../../../src/value-objects/Email';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { ForbiddenError, InvalidStateError, NotFoundError } from '../../../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

const BUYER_ID = new UniqueEntityID();
const SELLER_ID = new UniqueEntityID();

const BUYER: Actor = { id: BUYER_ID.toString(), role: UserRole.BUYER };
const SELLER: Actor = { id: SELLER_ID.toString(), role: UserRole.SELLER };

function unaOperacion(hasta: OperationStatus = 'asset_in_custody'): Operation {
    const op = Operation.create({
        listingId: new UniqueEntityID(),
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        offerPrice: Money.fromCents(1_000_000, 'USD'),
    });
    op.acceptCurrentOffer('seller');
    if (hasta === 'contract_pending') return op;

    op.signContract();
    if (hasta === 'contract_signed') return op;

    op.initiateTransfer();
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
        const { uso } = armar(unaOperacion());

        const checkout = await uso.execute('op-1', BUYER);

        expect(checkout.url).toBe('https://mp/checkout');
    });

    it('cobra exactamente lo que el comprador debe, con comisión incluida', async () => {
        const operation = unaOperacion();
        const { uso, gateway } = armar(operation);

        await uso.execute('op-1', BUYER);

        expect(gateway.createCheckout).toHaveBeenCalledWith(
            expect.objectContaining({
                amountCents: 1_050_000,
                currency: 'USD',
                externalReference: operation.id.toString(),
            }),
        );
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
});
