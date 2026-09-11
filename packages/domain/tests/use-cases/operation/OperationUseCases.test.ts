import { describe, it, expect, vi } from 'vitest';
import { InitiateTransferUseCase } from '../../../src/use-cases/operation/InitiateTransferUseCase';
import { ConfirmCustodyUseCase } from '../../../src/use-cases/operation/ConfirmCustodyUseCase';
import { ConfirmPaymentUseCase } from '../../../src/use-cases/operation/ConfirmPaymentUseCase';
import { CompleteOperationUseCase } from '../../../src/use-cases/operation/CompleteOperationUseCase';
import { IOperationRepository, IListingRepository } from '../../../src/ports/Repositories';
import { Operation } from '../../../src/entities/Operation';
import { Listing } from '../../../src/entities/Listing';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { PlatformNotifier } from '../../../src/services/PlatformNotifier';
import { Actor } from '../../../src/ports/Actor';
import { ForbiddenError, NotFoundError } from '../../../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

// Identidades fijas: los pasos de la operación ahora se autorizan por
// pertenencia (el seller entrega) o por rol (la plataforma custodia y paga).
const BUYER_ID = new UniqueEntityID();
const SELLER_ID = new UniqueEntityID();
const SELLER: Actor = { id: SELLER_ID.toString(), role: UserRole.SELLER };
const BUYER: Actor = { id: BUYER_ID.toString(), role: UserRole.BUYER };
const ADMIN: Actor = { id: 'admin-id', role: UserRole.ADMIN };

// Constancia mínima válida: sin propiedad principal ni accesos asegurados
// la entidad rechaza declarar la custodia.
const CUSTODIA_OK = {
    isPrimaryOwner: true,
    accessSecured: true,
    metrics: { subscribers: 55000 },
};

// ── Mock Factories ───────────────────────────────────────

function createMockOperationRepo(overrides: Partial<IOperationRepository> = {}): IOperationRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findByListing: vi.fn().mockResolvedValue([]),
        findByParty: vi.fn().mockResolvedValue([]),
        findByStatuses: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

function createMockListingRepo(overrides: Partial<IListingRepository> = {}): IListingRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findPublished: vi.fn().mockResolvedValue([]),
        findBySeller: vi.fn().mockResolvedValue([]),
        findByStatus: vi.fn().mockResolvedValue([]),
        findHeldBy: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

/**
 * Un listing con acceso de plataforma ya registrado, opcionalmente apuntando
 * a una cuenta de custodia. `custodyAccountId` ausente simula una constancia
 * anterior a `asset-custody-identity`, que no nombra ninguna cuenta.
 */
function unListingConAcceso(custodyAccountId?: UniqueEntityID): Listing {
    return Listing.reconstitute(
        {
            sellerId: SELLER_ID,
            assetStrategy: new YouTubeStrategy({
                monthlyRevenueUsd: Money.fromCents(50000, 'USD'),
                subscribers: 10000,
                isMonetized: true,
            }),
            askingPrice: Money.fromCents(1000000, 'USD'),
            status: 'in_operation',
            platformAccess: {
                verifiedBy: new UniqueEntityID(),
                verifiedAt: new Date(),
                accessSince: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
                custodyAccountId,
                heldRole: 'owner',
            },
        },
        new UniqueEntityID(),
        new Date(),
    );
}

/** Crea una operación en el estado deseado para testear transiciones */
function createOperationInState(targetState: string) {
    const op = Operation.create({
        listingId: new UniqueEntityID(),
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        offerPrice: Money.fromCents(200000, 'USD'),
    });

    // Avanzar al estado deseado
    if (targetState === 'offer_sent') return op;
    op.acceptCurrentOffer('seller');
    if (targetState === 'contract_pending') return op;
    op.signContract();
    if (targetState === 'contract_signed') return op;
    op.initiateTransfer({ declaredBy: SELLER_ID, controlCeded: true });
    if (targetState === 'transfer_in_progress') return op;
    op.confirmAssetCustody({
        verifiedBy: new UniqueEntityID(),
        ...CUSTODIA_OK,
    });
    if (targetState === 'asset_in_custody') return op;
    op.confirmBuyerPayment(unPagoDe(op));
    if (targetState === 'payment_received') return op;
    op.declareRecipientIdentity('comprador@gmail.com', BUYER_ID.toString());
    op.complete({
        verifiedBy: new UniqueEntityID(),
        buyerIsPrimaryOwner: true,
        accessTransferred: true,
        sellerRemoved: true,
    });
    return op; // completed
}

// ═════════════════════════════════════════════════════════
// InitiateTransferUseCase
// ═════════════════════════════════════════════════════════

describe('InitiateTransferUseCase', () => {
    it('debería iniciar la transferencia desde contract_signed', async () => {
        const op = createOperationInState('contract_signed');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });
        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(unListingConAcceso()),
        });

        await new InitiateTransferUseCase(repo, listingRepo).execute(
            op.id.toString(),
            { controlCeded: true },
            SELLER,
        );

        expect(op.status).toBe('transfer_in_progress');
        expect(repo.save).toHaveBeenCalledOnce();
    });

    it('debería fallar si la operación no existe', async () => {
        const repo = createMockOperationRepo();
        const listingRepo = createMockListingRepo();

        await expect(
            new InitiateTransferUseCase(repo, listingRepo).execute('x', { controlCeded: true }, SELLER),
        ).rejects.toThrow('Operación no encontrada');
    });

    it('debería fallar si no está en contract_signed', async () => {
        const op = createOperationInState('offer_sent');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });
        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(unListingConAcceso()),
        });

        await expect(
            new InitiateTransferUseCase(repo, listingRepo).execute(
                op.id.toString(),
                { controlCeded: true },
                SELLER,
            ),
        ).rejects.toThrow('El contrato debe estar firmado');
    });

    it('congela custodyAccountId desde el platformAccess vigente del listing', async () => {
        const op = createOperationInState('contract_signed');
        const cuenta = new UniqueEntityID();
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });
        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(unListingConAcceso(cuenta)),
        });

        await new InitiateTransferUseCase(repo, listingRepo).execute(
            op.id.toString(),
            { controlCeded: true },
            SELLER,
        );

        expect(op.transferInitiation?.custodyAccountId?.toString()).toBe(cuenta.toString());
    });

    it('sin cuenta asignada en el acceso, avanza igual con custodyAccountId indefinido', async () => {
        const op = createOperationInState('contract_signed');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });
        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(unListingConAcceso(undefined)),
        });

        await new InitiateTransferUseCase(repo, listingRepo).execute(
            op.id.toString(),
            { controlCeded: true },
            SELLER,
        );

        expect(op.status).toBe('transfer_in_progress');
        expect(op.transferInitiation?.custodyAccountId).toBeUndefined();
    });

    it('sin listing → NotFoundError', async () => {
        const op = createOperationInState('contract_signed');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });
        const listingRepo = createMockListingRepo({ findById: vi.fn().mockResolvedValue(null) });

        await expect(
            new InitiateTransferUseCase(repo, listingRepo).execute(
                op.id.toString(),
                { controlCeded: true },
                SELLER,
            ),
        ).rejects.toThrow(NotFoundError);
    });

    it('declaredBy sale del actor, no de lo que aporte quien llama', async () => {
        const op = createOperationInState('contract_signed');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });
        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(unListingConAcceso()),
        });

        await new InitiateTransferUseCase(repo, listingRepo).execute(
            op.id.toString(),
            { controlCeded: true },
            SELLER,
        );

        expect(op.transferInitiation?.declaredBy.toString()).toBe(SELLER_ID.toString());
    });

    it('custodia_pendiente sale exactamente una vez, después de la declaración', async () => {
        const op = createOperationInState('contract_signed');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });
        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(unListingConAcceso()),
        });
        const avisos = { custodyNeeded: vi.fn().mockResolvedValue(undefined) } as unknown as PlatformNotifier;

        await new InitiateTransferUseCase(repo, listingRepo, avisos).execute(
            op.id.toString(),
            { controlCeded: true },
            SELLER,
        );

        expect(avisos.custodyNeeded).toHaveBeenCalledOnce();
    });

    it('custodia_pendiente no sale si la declaración se rechaza', async () => {
        const op = createOperationInState('contract_signed');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });
        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(unListingConAcceso()),
        });
        const avisos = { custodyNeeded: vi.fn().mockResolvedValue(undefined) } as unknown as PlatformNotifier;

        await expect(
            new InitiateTransferUseCase(repo, listingRepo, avisos).execute(
                op.id.toString(),
                { controlCeded: false },
                SELLER,
            ),
        ).rejects.toThrow();

        expect(avisos.custodyNeeded).not.toHaveBeenCalled();
        expect(repo.save).not.toHaveBeenCalled();
    });
});

// ═════════════════════════════════════════════════════════
// ConfirmCustodyUseCase
// ═════════════════════════════════════════════════════════

describe('ConfirmCustodyUseCase', () => {
    it('debería confirmar custodia del activo', async () => {
        const op = createOperationInState('transfer_in_progress');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });
        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(unListingConAcceso()),
        });

        await new ConfirmCustodyUseCase(repo, listingRepo).execute(op.id.toString(), CUSTODIA_OK, ADMIN);

        expect(op.status).toBe('asset_in_custody');
    });

    it('debería fallar si no hay transferencia en curso', async () => {
        const op = createOperationInState('contract_signed');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });
        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(unListingConAcceso()),
        });

        await expect(new ConfirmCustodyUseCase(repo, listingRepo).execute(op.id.toString(), CUSTODIA_OK, ADMIN))
            .rejects.toThrow('No hay transferencia en curso');
    });

    it('congela custodyAccountId desde el platformAccess vigente del listing', async () => {
        const op = createOperationInState('transfer_in_progress');
        const cuenta = new UniqueEntityID();
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });
        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(unListingConAcceso(cuenta)),
        });

        await new ConfirmCustodyUseCase(repo, listingRepo).execute(op.id.toString(), CUSTODIA_OK, ADMIN);

        expect(op.custodyVerification?.custodyAccountId?.toString()).toBe(cuenta.toString());
    });

    it('sin cuenta asignada en el acceso, persiste custodyAccountId indefinido', async () => {
        const op = createOperationInState('transfer_in_progress');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });
        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(unListingConAcceso(undefined)),
        });

        await new ConfirmCustodyUseCase(repo, listingRepo).execute(op.id.toString(), CUSTODIA_OK, ADMIN);

        expect(op.custodyVerification?.custodyAccountId).toBeUndefined();
    });

    it('sin listing → NotFoundError', async () => {
        const op = createOperationInState('transfer_in_progress');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });
        const listingRepo = createMockListingRepo({ findById: vi.fn().mockResolvedValue(null) });

        await expect(new ConfirmCustodyUseCase(repo, listingRepo).execute(op.id.toString(), CUSTODIA_OK, ADMIN))
            .rejects.toThrow(NotFoundError);
    });
});

// ═════════════════════════════════════════════════════════
// ConfirmPaymentUseCase
// ═════════════════════════════════════════════════════════

describe('ConfirmPaymentUseCase', () => {
    it('debería confirmar el pago del buyer', async () => {
        const op = createOperationInState('asset_in_custody');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });

        await new ConfirmPaymentUseCase(repo).execute(op.id.toString(), unPagoDe(op), ADMIN);

        expect(op.status).toBe('payment_received');
    });

    it('debería fallar si el activo no está en custodia', async () => {
        const op = createOperationInState('transfer_in_progress');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });

        await expect(new ConfirmPaymentUseCase(repo).execute(op.id.toString(), unPagoDe(op), ADMIN))
            .rejects.toThrow('El activo debe estar en custodia');
    });
});

// ═════════════════════════════════════════════════════════
// CompleteOperationUseCase
// ═════════════════════════════════════════════════════════

describe('CompleteOperationUseCase', () => {
    const ENTREGA_OK = {
        buyerIsPrimaryOwner: true,
        accessTransferred: true,
        sellerRemoved: true,
    };

    it('debería completar la operación y marcar el listing como vendido', async () => {
        const op = createOperationInState('payment_received');
        op.declareRecipientIdentity('comprador@gmail.com', BUYER_ID.toString());

        const listing = Listing.create({
            sellerId: new UniqueEntityID(),
            assetStrategy: new YouTubeStrategy({
                monthlyRevenueUsd: Money.fromCents(50000, 'USD'),
                subscribers: 10000,
                growthFactor: 1.2,
                isMonetized: true,
            }),
            askingPrice: Money.fromCents(1000000, 'USD'),
        });
        listing.submitForReview();
        listing.approve();
        listing.markInOperation();

        const operationRepo = createMockOperationRepo({
            findById: vi.fn().mockResolvedValue(op),
        });
        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(listing),
        });

        await new CompleteOperationUseCase(operationRepo, listingRepo).execute(op.id.toString(), ENTREGA_OK, ADMIN);

        expect(op.status).toBe('completed');
        expect(listing.status).toBe('sold');
        expect(listingRepo.save).toHaveBeenCalledOnce();
    });

    it('debería fallar si el pago no fue confirmado', async () => {
        const op = createOperationInState('asset_in_custody');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });
        const listingRepo = createMockListingRepo();

        await expect(new CompleteOperationUseCase(repo, listingRepo).execute(op.id.toString(), ENTREGA_OK, ADMIN))
            .rejects.toThrow('El pago debe estar confirmado');
    });
});

// ═════════════════════════════════════════════════════════
// Autorización
// ═════════════════════════════════════════════════════════

describe('Autorización de los pasos de la operación', () => {
    it('el buyer no puede iniciar la transferencia — la entrega es del seller', async () => {
        const op = createOperationInState('contract_signed');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });
        const listingRepo = createMockListingRepo();

        await expect(
            new InitiateTransferUseCase(repo, listingRepo).execute(op.id.toString(), { controlCeded: true }, BUYER),
        ).rejects.toThrow(ForbiddenError);
    });

    it('un tercero no puede iniciar la transferencia', async () => {
        const op = createOperationInState('contract_signed');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });
        const listingRepo = createMockListingRepo();
        const ajeno: Actor = { id: new UniqueEntityID().toString(), role: UserRole.SELLER };

        await expect(
            new InitiateTransferUseCase(repo, listingRepo).execute(op.id.toString(), { controlCeded: true }, ajeno),
        ).rejects.toThrow(ForbiddenError);
    });

    it('confirmar custodia es exclusivo de la plataforma', async () => {
        const op = createOperationInState('transfer_in_progress');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });
        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(unListingConAcceso()),
        });

        await expect(new ConfirmCustodyUseCase(repo, listingRepo).execute(op.id.toString(), CUSTODIA_OK, SELLER))
            .rejects.toThrow(ForbiddenError);
    });

    it('confirmar el pago es exclusivo de la plataforma', async () => {
        const op = createOperationInState('asset_in_custody');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });

        await expect(new ConfirmPaymentUseCase(repo).execute(op.id.toString(), unPagoDe(op), BUYER))
            .rejects.toThrow(ForbiddenError);
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
