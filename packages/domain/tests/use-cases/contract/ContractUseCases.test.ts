import { describe, it, expect, vi } from 'vitest';
import { SignNdaUseCase } from '../../../src/use-cases/contract/SignNdaUseCase';
import { SignContractUseCase } from '../../../src/use-cases/contract/SignContractUseCase';
import {
    IContractRepository,
    IListingRepository,
    IOperationRepository,
    IUserRepository,
} from '../../../src/ports/Repositories';
import { Actor } from '../../../src/ports/Actor';
import { Contract } from '../../../src/entities/Contract';
import { Listing } from '../../../src/entities/Listing';
import { Operation } from '../../../src/entities/Operation';
import { User } from '../../../src/entities/User';
import { Email } from '../../../src/value-objects/Email';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { ForbiddenError } from '../../../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

// ── Mock Factories ───────────────────────────────────────

function createMockContractRepo(overrides: Partial<IContractRepository> = {}): IContractRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findByOperation: vi.fn().mockResolvedValue([]),
        findByListingAndSigner: vi.fn().mockResolvedValue(null),
        findAllByListing: vi.fn().mockResolvedValue([]),
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

function createMockOperationRepo(overrides: Partial<IOperationRepository> = {}): IOperationRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findByListing: vi.fn().mockResolvedValue([]),
        findByParty: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

function createMockUserRepo(overrides: Partial<IUserRepository> = {}): IUserRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findByEmail: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

function unUsuario(kycVerificado: boolean): User {
    const user = User.create({
        email: Email.create('firmante@example.com'),
        fullName: 'Firmante Verificado',
        dni: '20123456789',
        role: UserRole.BUYER,
        passwordHash: 'hash-de-prueba',
    });
    if (kycVerificado) user.verifyKyc();
    return user;
}

function actorDe(id: UniqueEntityID): Actor {
    return { id: id.toString(), role: UserRole.BUYER };
}

function createPublishedListing(sellerId = new UniqueEntityID()) {
    const listing = Listing.create({
        sellerId,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(50000, 'USD'),
            subscribers: 10000,
            growthFactor: 1.2,
            isMonetized: true,
        }),
        askingPrice: Money.fromCents(1000000, 'USD'),
        isBlind: true,
    });
    listing.submitForReview();
    listing.approve();
    return listing;
}

// ═════════════════════════════════════════════════════════
// SignNdaUseCase
// ═════════════════════════════════════════════════════════

describe('SignNdaUseCase', () => {
    it('crea un buyer_nda y lo deja completamente firmado', async () => {
        const listing = createPublishedListing();
        const buyerId = new UniqueEntityID();

        const contractRepo = createMockContractRepo();
        const useCase = new SignNdaUseCase(
            contractRepo,
            createMockListingRepo({ findById: vi.fn().mockResolvedValue(listing) }),
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(unUsuario(true)) }),
        );

        const nda = await useCase.execute(listing.id.toString(), '192.168.1.1', actorDe(buyerId));

        expect(nda.type).toBe('buyer_nda');
        expect(nda.hasSignedBy('buyer')).toBe(true);
        // La plataforma firma automáticamente. Sin esto el NDA nunca se
        // completaba y el listing blind no se desbloqueaba jamás.
        expect(nda.hasSignedBy('platform')).toBe(true);
        expect(nda.isFullySigned()).toBe(true);
        expect(contractRepo.save).toHaveBeenCalledOnce();
    });

    it('crea un seller_nda cuando quien firma es el dueño del listing', async () => {
        const sellerId = new UniqueEntityID();
        const listing = createPublishedListing(sellerId);

        const useCase = new SignNdaUseCase(
            createMockContractRepo(),
            createMockListingRepo({ findById: vi.fn().mockResolvedValue(listing) }),
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(unUsuario(true)) }),
        );

        const nda = await useCase.execute(listing.id.toString(), '192.168.1.1', actorDe(sellerId));

        expect(nda.type).toBe('seller_nda');
        expect(nda.hasSignedBy('seller')).toBe(true);
        expect(nda.isFullySigned()).toBe(true);
    });

    it('reutiliza el NDA existente en vez de crear uno nuevo', async () => {
        const listing = createPublishedListing();
        const buyerId = new UniqueEntityID();
        const existingNda = Contract.createBuyerNda(listing.id, buyerId);

        const useCase = new SignNdaUseCase(
            createMockContractRepo({
                findByListingAndSigner: vi.fn().mockResolvedValue(existingNda),
            }),
            createMockListingRepo({ findById: vi.fn().mockResolvedValue(listing) }),
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(unUsuario(true)) }),
        );

        const nda = await useCase.execute(listing.id.toString(), '192.168.1.1', actorDe(buyerId));

        expect(nda.id.toString()).toBe(existingNda.id.toString());
        expect(nda.hasSignedBy('buyer')).toBe(true);
    });

    it('rechaza a un usuario sin KYC verificado', async () => {
        const listing = createPublishedListing();

        const useCase = new SignNdaUseCase(
            createMockContractRepo(),
            createMockListingRepo({ findById: vi.fn().mockResolvedValue(listing) }),
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(unUsuario(false)) }),
        );

        await expect(
            useCase.execute(listing.id.toString(), '1.1.1.1', actorDe(new UniqueEntityID())),
        ).rejects.toThrow(ForbiddenError);
    });

    it('falla si el listing no existe', async () => {
        const useCase = new SignNdaUseCase(
            createMockContractRepo(),
            createMockListingRepo(),
            createMockUserRepo(),
        );

        await expect(
            useCase.execute('nonexistent', '127.0.0.1', actorDe(new UniqueEntityID())),
        ).rejects.toThrow('Listing no encontrado');
    });
});

// ═════════════════════════════════════════════════════════
// SignContractUseCase
// ═════════════════════════════════════════════════════════

function unaOperacionEnContractPending(buyerId: UniqueEntityID, sellerId: UniqueEntityID): Operation {
    const operation = Operation.create({
        listingId: new UniqueEntityID(),
        buyerId,
        sellerId,
        offerPrice: Money.fromCents(200000, 'USD'),
    });
    operation.acceptCurrentOffer('seller');
    return operation;
}

describe('SignContractUseCase', () => {
    it('deriva el rol de firma de la posición del actor en la operación', async () => {
        const buyerId = new UniqueEntityID();
        const sellerId = new UniqueEntityID();
        const operation = unaOperacionEnContractPending(buyerId, sellerId);
        const contract = Contract.createTripartite(new UniqueEntityID(), operation.id);

        const contractRepo = createMockContractRepo({
            findById: vi.fn().mockResolvedValue(contract),
        });
        const useCase = new SignContractUseCase(
            contractRepo,
            createMockOperationRepo({ findById: vi.fn().mockResolvedValue(operation) }),
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(unUsuario(true)) }),
        );

        await useCase.execute(contract.id.toString(), '10.0.0.1', actorDe(buyerId));

        // Nadie declaró "buyer": se dedujo de que el actor es el buyer de esa operación.
        expect(contract.hasSignedBy('buyer')).toBe(true);
        expect(contract.hasSignedBy('seller')).toBe(false);
        expect(contract.hasSignedBy('platform')).toBe(true);
        expect(contractRepo.save).toHaveBeenCalledOnce();
    });

    it('transiciona la operación cuando se completan las tres firmas', async () => {
        const buyerId = new UniqueEntityID();
        const sellerId = new UniqueEntityID();
        const operation = unaOperacionEnContractPending(buyerId, sellerId);
        const contract = Contract.createTripartite(new UniqueEntityID(), operation.id);

        const operationRepo = createMockOperationRepo({
            findById: vi.fn().mockResolvedValue(operation),
        });
        const useCase = new SignContractUseCase(
            createMockContractRepo({ findById: vi.fn().mockResolvedValue(contract) }),
            operationRepo,
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(unUsuario(true)) }),
        );

        // El buyer firma primero: se suma también la plataforma.
        await useCase.execute(contract.id.toString(), '10.0.0.1', actorDe(buyerId));
        expect(contract.isFullySigned()).toBe(false);
        expect(operation.status).toBe('contract_pending');

        // El seller cierra el contrato.
        await useCase.execute(contract.id.toString(), '10.0.0.2', actorDe(sellerId));

        expect(contract.isFullySigned()).toBe(true);
        expect(operation.status).toBe('contract_signed');
    });

    it('rechaza a quien no es parte de la operación', async () => {
        const operation = unaOperacionEnContractPending(new UniqueEntityID(), new UniqueEntityID());
        const contract = Contract.createTripartite(new UniqueEntityID(), operation.id);

        const useCase = new SignContractUseCase(
            createMockContractRepo({ findById: vi.fn().mockResolvedValue(contract) }),
            createMockOperationRepo({ findById: vi.fn().mockResolvedValue(operation) }),
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(unUsuario(true)) }),
        );

        await expect(
            useCase.execute(contract.id.toString(), '10.0.0.9', actorDe(new UniqueEntityID())),
        ).rejects.toThrow(ForbiddenError);
    });

    it('falla si el contrato no existe', async () => {
        const useCase = new SignContractUseCase(
            createMockContractRepo(),
            createMockOperationRepo(),
            createMockUserRepo(),
        );

        await expect(
            useCase.execute('nonexistent', '127.0.0.1', actorDe(new UniqueEntityID())),
        ).rejects.toThrow('Contrato no encontrado');
    });

    it('falla si el mismo actor intenta firmar dos veces', async () => {
        const buyerId = new UniqueEntityID();
        const operation = unaOperacionEnContractPending(buyerId, new UniqueEntityID());
        const contract = Contract.createTripartite(new UniqueEntityID(), operation.id);

        const useCase = new SignContractUseCase(
            createMockContractRepo({ findById: vi.fn().mockResolvedValue(contract) }),
            createMockOperationRepo({ findById: vi.fn().mockResolvedValue(operation) }),
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(unUsuario(true)) }),
        );

        await useCase.execute(contract.id.toString(), '10.0.0.1', actorDe(buyerId));

        await expect(
            useCase.execute(contract.id.toString(), '10.0.0.1', actorDe(buyerId)),
        ).rejects.toThrow('ya firmó');
    });
});
