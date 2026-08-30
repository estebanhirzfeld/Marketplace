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
import { Actor } from '../../../src/ports/Actor';
import { ForbiddenError } from '../../../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

// Identidades fijas: los pasos de la operación ahora se autorizan por
// pertenencia (el seller entrega) o por rol (la plataforma custodia y paga).
const BUYER_ID = new UniqueEntityID();
const SELLER_ID = new UniqueEntityID();
const SELLER: Actor = { id: SELLER_ID.toString(), role: UserRole.SELLER };
const BUYER: Actor = { id: BUYER_ID.toString(), role: UserRole.BUYER };
const ADMIN: Actor = { id: 'admin-id', role: UserRole.ADMIN };

// ── Mock Factories ───────────────────────────────────────

function createMockOperationRepo(overrides: Partial<IOperationRepository> = {}): IOperationRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findByListing: vi.fn().mockResolvedValue([]),
        findByParty: vi.fn().mockResolvedValue([]),
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
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
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
    op.initiateTransfer();
    if (targetState === 'transfer_in_progress') return op;
    op.confirmAssetCustody();
    if (targetState === 'asset_in_custody') return op;
    op.confirmBuyerPayment();
    if (targetState === 'payment_received') return op;
    op.complete();
    return op; // completed
}

// ═════════════════════════════════════════════════════════
// InitiateTransferUseCase
// ═════════════════════════════════════════════════════════

describe('InitiateTransferUseCase', () => {
    it('debería iniciar la transferencia desde contract_signed', async () => {
        const op = createOperationInState('contract_signed');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });

        await new InitiateTransferUseCase(repo).execute(op.id.toString(), SELLER);

        expect(op.status).toBe('transfer_in_progress');
        expect(repo.save).toHaveBeenCalledOnce();
    });

    it('debería fallar si la operación no existe', async () => {
        const repo = createMockOperationRepo();
        await expect(new InitiateTransferUseCase(repo).execute('x', SELLER))
            .rejects.toThrow('Operación no encontrada');
    });

    it('debería fallar si no está en contract_signed', async () => {
        const op = createOperationInState('offer_sent');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });

        await expect(new InitiateTransferUseCase(repo).execute(op.id.toString(), SELLER))
            .rejects.toThrow('El contrato debe estar firmado');
    });
});

// ═════════════════════════════════════════════════════════
// ConfirmCustodyUseCase
// ═════════════════════════════════════════════════════════

describe('ConfirmCustodyUseCase', () => {
    it('debería confirmar custodia del activo', async () => {
        const op = createOperationInState('transfer_in_progress');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });

        await new ConfirmCustodyUseCase(repo).execute(op.id.toString(), ADMIN);

        expect(op.status).toBe('asset_in_custody');
    });

    it('debería fallar si no hay transferencia en curso', async () => {
        const op = createOperationInState('contract_signed');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });

        await expect(new ConfirmCustodyUseCase(repo).execute(op.id.toString(), ADMIN))
            .rejects.toThrow('No hay transferencia en curso');
    });
});

// ═════════════════════════════════════════════════════════
// ConfirmPaymentUseCase
// ═════════════════════════════════════════════════════════

describe('ConfirmPaymentUseCase', () => {
    it('debería confirmar el pago del buyer', async () => {
        const op = createOperationInState('asset_in_custody');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });

        await new ConfirmPaymentUseCase(repo).execute(op.id.toString(), ADMIN);

        expect(op.status).toBe('payment_received');
    });

    it('debería fallar si el activo no está en custodia', async () => {
        const op = createOperationInState('transfer_in_progress');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });

        await expect(new ConfirmPaymentUseCase(repo).execute(op.id.toString(), ADMIN))
            .rejects.toThrow('El activo debe estar en custodia');
    });
});

// ═════════════════════════════════════════════════════════
// CompleteOperationUseCase
// ═════════════════════════════════════════════════════════

describe('CompleteOperationUseCase', () => {
    it('debería completar la operación y marcar el listing como vendido', async () => {
        const op = createOperationInState('payment_received');

        const listing = Listing.create({
            sellerId: new UniqueEntityID(),
            assetStrategy: new YouTubeStrategy({
                monthlyRevenueUsd: Money.fromCents(50000, 'USD'),
                subscribers: 10000,
                growthFactor: 1.2,
                isMonetized: true,
            }),
            askingPrice: Money.fromCents(1000000, 'USD'),
            isBlind: false,
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

        await new CompleteOperationUseCase(operationRepo, listingRepo).execute(op.id.toString(), ADMIN);

        expect(op.status).toBe('completed');
        expect(listing.status).toBe('sold');
        expect(listingRepo.save).toHaveBeenCalledOnce();
    });

    it('debería fallar si el pago no fue confirmado', async () => {
        const op = createOperationInState('asset_in_custody');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });
        const listingRepo = createMockListingRepo();

        await expect(new CompleteOperationUseCase(repo, listingRepo).execute(op.id.toString(), ADMIN))
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

        await expect(new InitiateTransferUseCase(repo).execute(op.id.toString(), BUYER))
            .rejects.toThrow(ForbiddenError);
    });

    it('un tercero no puede iniciar la transferencia', async () => {
        const op = createOperationInState('contract_signed');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });
        const ajeno: Actor = { id: new UniqueEntityID().toString(), role: UserRole.SELLER };

        await expect(new InitiateTransferUseCase(repo).execute(op.id.toString(), ajeno))
            .rejects.toThrow(ForbiddenError);
    });

    it('confirmar custodia es exclusivo de la plataforma', async () => {
        const op = createOperationInState('transfer_in_progress');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });

        await expect(new ConfirmCustodyUseCase(repo).execute(op.id.toString(), SELLER))
            .rejects.toThrow(ForbiddenError);
    });

    it('confirmar el pago es exclusivo de la plataforma', async () => {
        const op = createOperationInState('asset_in_custody');
        const repo = createMockOperationRepo({ findById: vi.fn().mockResolvedValue(op) });

        await expect(new ConfirmPaymentUseCase(repo).execute(op.id.toString(), BUYER))
            .rejects.toThrow(ForbiddenError);
    });
});
