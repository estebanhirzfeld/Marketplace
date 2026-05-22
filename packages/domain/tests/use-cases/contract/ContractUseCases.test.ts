import { describe, it, expect, vi } from 'vitest';
import { SignNdaUseCase } from '../../../src/use-cases/contract/SignNdaUseCase';
import { SignContractUseCase } from '../../../src/use-cases/contract/SignContractUseCase';
import { IContractRepository, IListingRepository, IOperationRepository } from '../../../src/ports/Repositories';
import { Contract } from '../../../src/entities/Contract';
import { Listing } from '../../../src/entities/Listing';
import { Operation } from '../../../src/entities/Operation';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';

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
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

function createMockOperationRepo(overrides: Partial<IOperationRepository> = {}): IOperationRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findByListing: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

function createPublishedListing() {
    const listing = Listing.create({
        sellerId: new UniqueEntityID(),
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
    it('debería crear y firmar un NDA nuevo si no existe', async () => {
        const listing = createPublishedListing();
        const buyerId = new UniqueEntityID();

        const contractRepo = createMockContractRepo();
        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(listing),
        });

        const useCase = new SignNdaUseCase(contractRepo, listingRepo);
        const nda = await useCase.execute(listing.id.toString(), buyerId.toString(), '192.168.1.1');

        expect(nda.type).toBe('buyer_nda');
        expect(nda.hasSignedBy('buyer')).toBe(true);
        expect(nda.hasSignedBy('platform')).toBe(false);
        expect(contractRepo.save).toHaveBeenCalledOnce();
    });

    it('debería firmar un NDA existente sin crear uno nuevo', async () => {
        const listing = createPublishedListing();
        const buyerId = new UniqueEntityID();
        const existingNda = Contract.createBuyerNda(listing.id, buyerId);

        const contractRepo = createMockContractRepo({
            findByListingAndSigner: vi.fn().mockResolvedValue(existingNda),
        });
        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(listing),
        });

        const useCase = new SignNdaUseCase(contractRepo, listingRepo);
        const nda = await useCase.execute(listing.id.toString(), buyerId.toString(), '192.168.1.1');

        // Debería ser el mismo NDA, no uno nuevo
        expect(nda.id.toString()).toBe(existingNda.id.toString());
        expect(nda.hasSignedBy('buyer')).toBe(true);
    });

    it('debería fallar si el listing no existe', async () => {
        const contractRepo = createMockContractRepo();
        const listingRepo = createMockListingRepo();

        const useCase = new SignNdaUseCase(contractRepo, listingRepo);
        await expect(useCase.execute('nonexistent', 'buyer-id', '127.0.0.1'))
            .rejects.toThrow('Listing no encontrado');
    });
});

// ═════════════════════════════════════════════════════════
// SignContractUseCase
// ═════════════════════════════════════════════════════════

describe('SignContractUseCase', () => {
    it('debería firmar un contrato tripartito', async () => {
        const contract = Contract.createTripartite(new UniqueEntityID(), new UniqueEntityID());

        const contractRepo = createMockContractRepo({
            findById: vi.fn().mockResolvedValue(contract),
        });
        const operationRepo = createMockOperationRepo();

        const useCase = new SignContractUseCase(contractRepo, operationRepo);
        await useCase.execute(contract.id.toString(), 'buyer', '10.0.0.1');

        expect(contract.hasSignedBy('buyer')).toBe(true);
        expect(contractRepo.save).toHaveBeenCalledOnce();
    });

    it('debería transicionar la operación cuando el tripartito se firma completamente', async () => {
        const operationId = new UniqueEntityID();
        const contract = Contract.createTripartite(new UniqueEntityID(), operationId);
        contract.sign('buyer', '10.0.0.1');
        contract.sign('seller', '10.0.0.2');
        // Falta platform — lo va a firmar el use case

        const operation = Operation.create({
            listingId: new UniqueEntityID(),
            buyerId: new UniqueEntityID(),
            sellerId: new UniqueEntityID(),
            offerPrice: Money.fromCents(200000, 'USD'),
        });
        operation.acceptCurrentOffer('seller'); // → contract_pending

        const contractRepo = createMockContractRepo({
            findById: vi.fn().mockResolvedValue(contract),
        });
        const operationRepo = createMockOperationRepo({
            findById: vi.fn().mockResolvedValue(operation),
        });

        const useCase = new SignContractUseCase(contractRepo, operationRepo);
        await useCase.execute(contract.id.toString(), 'platform', '10.0.0.3');

        expect(contract.isFullySigned()).toBe(true);
        expect(operation.status).toBe('contract_signed');
        expect(operationRepo.save).toHaveBeenCalledOnce();
    });

    it('debería fallar si el contrato no existe', async () => {
        const contractRepo = createMockContractRepo();
        const operationRepo = createMockOperationRepo();

        const useCase = new SignContractUseCase(contractRepo, operationRepo);
        await expect(useCase.execute('nonexistent', 'buyer', '127.0.0.1'))
            .rejects.toThrow('Contrato no encontrado');
    });

    it('debería fallar si el rol ya firmó', async () => {
        const contract = Contract.createTripartite(new UniqueEntityID(), new UniqueEntityID());
        contract.sign('buyer', '10.0.0.1');

        const contractRepo = createMockContractRepo({
            findById: vi.fn().mockResolvedValue(contract),
        });
        const operationRepo = createMockOperationRepo();

        const useCase = new SignContractUseCase(contractRepo, operationRepo);
        await expect(useCase.execute(contract.id.toString(), 'buyer', '10.0.0.1'))
            .rejects.toThrow('ya firmó');
    });
});
