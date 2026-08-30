import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateListingUseCase } from '../../../src/use-cases/listing/CreateListingUseCase';
import { SubmitListingForReviewUseCase } from '../../../src/use-cases/listing/SubmitListingForReviewUseCase';
import { ApproveListingUseCase } from '../../../src/use-cases/listing/ApproveListingUseCase';
import { RejectListingUseCase } from '../../../src/use-cases/listing/RejectListingUseCase';
import { GetListingDetailsUseCase } from '../../../src/use-cases/listing/GetListingDetailsUseCase';
import { IListingRepository, IUserRepository, IContractRepository } from '../../../src/ports/Repositories';
import { Actor } from '../../../src/ports/Actor';
import { ForbiddenError } from '../../../src/errors/DomainError';
import { User } from '../../../src/entities/User';
import { Listing } from '../../../src/entities/Listing';
import { Contract } from '../../../src/entities/Contract';
import { Email } from '../../../src/value-objects/Email';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { UserRole } from '@marketplace/shared-types';

// ── Mock Factories ───────────────────────────────────────

// TODO REVIEW: Why null param on mocks

function createMockUserRepo(overrides: Partial<IUserRepository> = {}): IUserRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findByEmail: vi.fn().mockResolvedValue(null),
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

function createTestSeller() {
    const seller = User.create({
        email: Email.create('seller@test.com'),
        fullName: 'Seller Test',
        role: UserRole.SELLER,
        passwordHash: 'hash-de-prueba',
    });
    return seller;
}

function createVerifiedUser(role = UserRole.SELLER): User {
    const user = User.create({
        email: Email.create('verificado@test.com'),
        fullName: 'Usuario Verificado',
        dni: '20123456789',
        role,
        passwordHash: 'hash-de-prueba',
    });
    user.verifyKyc();
    return user;
}

function actorDe(id: UniqueEntityID | string, role = UserRole.SELLER): Actor {
    return { id: typeof id === 'string' ? id : id.toString(), role };
}

const ADMIN: Actor = { id: 'admin-id', role: UserRole.ADMIN };

function createTestStrategy() {
    return new YouTubeStrategy({
        monthlyRevenueUsd: Money.fromCents(50000, 'USD'),
        subscribers: 10000,
        growthFactor: 1.2,
        isMonetized: true,
        hasNoFaceContent: false,
        audienceTopCountry: 'US',
    });
}

// ═════════════════════════════════════════════════════════
// CreateListingUseCase
// ═════════════════════════════════════════════════════════

describe('CreateListingUseCase', () => {
    it('debería crear un listing y persistirlo', async () => {
        const seller = createTestSeller();
        const userRepo = createMockUserRepo({
            findById: vi.fn().mockResolvedValue(seller),
        });
        const listingRepo = createMockListingRepo();

        const useCase = new CreateListingUseCase(listingRepo, userRepo);

        const result = await useCase.execute({
            ...createTestStrategy().toJSON(),
            askingPrice: { cents: 1000000, currency: 'USD' },
            isBlind: true,
        }, actorDe(seller.id));

        expect(result.status).toBe('draft');
        expect(result.askingPrice.getCents()).toBe(1000000);
        expect(listingRepo.save).toHaveBeenCalledOnce();
    });

    it('debería fallar si el seller no existe', async () => {
        const userRepo = createMockUserRepo(); // findById devuelve null
        const listingRepo = createMockListingRepo();

        const useCase = new CreateListingUseCase(listingRepo, userRepo);

        await expect(useCase.execute({
            ...createTestStrategy().toJSON(),
            askingPrice: { cents: 1000000, currency: 'USD' },
            isBlind: true,
        }, actorDe('nonexistent-id'))).rejects.toThrow('Seller no encontrado');

        expect(listingRepo.save).not.toHaveBeenCalled();
    });
});

// ═════════════════════════════════════════════════════════
// SubmitListingForReviewUseCase
// ═════════════════════════════════════════════════════════

describe('SubmitListingForReviewUseCase', () => {
    it('debería transicionar un listing de draft a under_review', async () => {
        const sellerId = new UniqueEntityID();
        const listing = Listing.create({
            sellerId,
            assetStrategy: createTestStrategy(),
            askingPrice: Money.fromCents(1000000, 'USD'),
            isBlind: true,
        });

        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(listing),
        });

        const useCase = new SubmitListingForReviewUseCase(
            listingRepo,
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(createVerifiedUser()) }),
        );
        await useCase.execute(listing.id.toString(), actorDe(sellerId));

        expect(listing.status).toBe('under_review');
        expect(listingRepo.save).toHaveBeenCalledOnce();
    });

    it('debería fallar si el listing no existe', async () => {
        const listingRepo = createMockListingRepo();
        const useCase = new SubmitListingForReviewUseCase(listingRepo, createMockUserRepo());

        await expect(useCase.execute('nonexistent', actorDe(new UniqueEntityID())))
            .rejects.toThrow('Listing no encontrado');
    });

    it('debería rechazar a quien no es dueño del listing', async () => {
        const listing = Listing.create({
            sellerId: new UniqueEntityID(),
            assetStrategy: createTestStrategy(),
            askingPrice: Money.fromCents(1000000, 'USD'),
            isBlind: true,
        });

        const useCase = new SubmitListingForReviewUseCase(
            createMockListingRepo({ findById: vi.fn().mockResolvedValue(listing) }),
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(createVerifiedUser()) }),
        );

        await expect(useCase.execute(listing.id.toString(), actorDe(new UniqueEntityID())))
            .rejects.toThrow(ForbiddenError);
    });

    it('debería rechazar a un dueño sin KYC verificado', async () => {
        const sellerId = new UniqueEntityID();
        const listing = Listing.create({
            sellerId,
            assetStrategy: createTestStrategy(),
            askingPrice: Money.fromCents(1000000, 'USD'),
            isBlind: true,
        });
        const sinKyc = User.create({
            email: Email.create('sinkyc@test.com'),
            fullName: 'Sin KYC',
            role: UserRole.SELLER,
            passwordHash: 'hash-de-prueba',
        });

        const useCase = new SubmitListingForReviewUseCase(
            createMockListingRepo({ findById: vi.fn().mockResolvedValue(listing) }),
            createMockUserRepo({ findById: vi.fn().mockResolvedValue(sinKyc) }),
        );

        await expect(useCase.execute(listing.id.toString(), actorDe(sellerId)))
            .rejects.toThrow(ForbiddenError);
    });
});

// ═════════════════════════════════════════════════════════
// ApproveListingUseCase
// ═════════════════════════════════════════════════════════

describe('ApproveListingUseCase', () => {
    it('debería aprobar un listing en under_review', async () => {
        const listing = Listing.create({
            sellerId: new UniqueEntityID(),
            assetStrategy: createTestStrategy(),
            askingPrice: Money.fromCents(1000000, 'USD'),
            isBlind: true,
        });
        listing.submitForReview();

        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(listing),
        });

        const useCase = new ApproveListingUseCase(listingRepo);
        await useCase.execute(listing.id.toString(), ADMIN);

        expect(listing.status).toBe('published');
        expect(listingRepo.save).toHaveBeenCalledOnce();
    });

    it('debería fallar si el listing no está en under_review', async () => {
        const listing = Listing.create({
            sellerId: new UniqueEntityID(),
            assetStrategy: createTestStrategy(),
            askingPrice: Money.fromCents(1000000, 'USD'),
            isBlind: true,
        }); // status = draft

        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(listing),
        });

        const useCase = new ApproveListingUseCase(listingRepo);
        await expect(useCase.execute(listing.id.toString(), ADMIN))
            .rejects.toThrow('El listing debe estar en revisión para ser aprobado');
    });
});

// ═════════════════════════════════════════════════════════
// RejectListingUseCase
// ═════════════════════════════════════════════════════════

describe('RejectListingUseCase', () => {
    it('debería rechazar un listing con un motivo', async () => {
        const listing = Listing.create({
            sellerId: new UniqueEntityID(),
            assetStrategy: createTestStrategy(),
            askingPrice: Money.fromCents(1000000, 'USD'),
            isBlind: true,
        });
        listing.submitForReview();

        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(listing),
        });

        const useCase = new RejectListingUseCase(listingRepo);
        await useCase.execute(listing.id.toString(), 'Métricas insuficientes', ADMIN);

        expect(listing.status).toBe('rejected');
        expect(listingRepo.save).toHaveBeenCalledOnce();
    });

    it('debería fallar si no se provee un motivo', async () => {
        const listing = Listing.create({
            sellerId: new UniqueEntityID(),
            assetStrategy: createTestStrategy(),
            askingPrice: Money.fromCents(1000000, 'USD'),
            isBlind: true,
        });
        listing.submitForReview();

        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(listing),
        });

        const useCase = new RejectListingUseCase(listingRepo);
        await expect(useCase.execute(listing.id.toString(), '', ADMIN))
            .rejects.toThrow('Debe proveer un motivo de rechazo');
    });
});

// ═════════════════════════════════════════════════════════
// GetListingDetailsUseCase (Blind / Unblind via NDA)
// ═════════════════════════════════════════════════════════

describe('GetListingDetailsUseCase', () => {
    const createPublishedListing = (isBlind: boolean) => {
        const listing = Listing.create({
            sellerId: new UniqueEntityID(),
            assetStrategy: createTestStrategy(),
            askingPrice: Money.fromCents(1000000, 'USD'),
            isBlind,
        });
        listing.submitForReview();
        listing.approve();
        return listing;
    };

    it('debería devolver todos los datos si el listing NO es blind', async () => {
        const listing = createPublishedListing(false);

        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(listing),
        });
        const contractRepo = createMockContractRepo();

        const useCase = new GetListingDetailsUseCase(listingRepo, contractRepo);
        const result = await useCase.execute(listing.id.toString());

        expect(result.hiddenFields).toHaveLength(0);
        expect(result.assetData.subscribers).toBe(10000);
        expect(result.assetData.monthlyRevenueUsdCents).toBeDefined();
    });

    it('debería ocultar campos confidenciales si es blind y NO hay NDA', async () => {
        const listing = createPublishedListing(true);

        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(listing),
        });
        const contractRepo = createMockContractRepo(); // findByListingAndSigner devuelve null

        const useCase = new GetListingDetailsUseCase(listingRepo, contractRepo);
        const result = await useCase.execute(listing.id.toString(), actorDe(new UniqueEntityID(), UserRole.BUYER));

        expect(result.hiddenFields.length).toBeGreaterThan(0);
        // Los campos confidenciales NO deben estar en assetData
        for (const field of result.hiddenFields) {
            expect(result.assetData).not.toHaveProperty(field);
        }
    });

    it('debería mostrar todos los datos si es blind PERO hay NDA firmado', async () => {
        const listing = createPublishedListing(true);
        const buyerId = new UniqueEntityID();

        // Crear un NDA completamente firmado
        const nda = Contract.createBuyerNda(listing.id, buyerId);
        nda.attachDocument('a'.repeat(64));
        nda.sign('buyer', '127.0.0.1');
        nda.signAsPlatform();

        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(listing),
        });
        const contractRepo = createMockContractRepo({
            findByListingAndSigner: vi.fn().mockResolvedValue(nda),
        });

        const useCase = new GetListingDetailsUseCase(listingRepo, contractRepo);
        const result = await useCase.execute(listing.id.toString(), actorDe(buyerId, UserRole.BUYER));

        expect(result.hiddenFields).toHaveLength(0);
        expect(result.assetData.subscribers).toBe(10000);
        expect(result.assetData.monthlyRevenueUsdCents).toBeDefined();
    });

    it('debería ocultar datos si es blind y no se provee requesterId', async () => {
        const listing = createPublishedListing(true);

        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(listing),
        });
        const contractRepo = createMockContractRepo();

        const useCase = new GetListingDetailsUseCase(listingRepo, contractRepo);
        const result = await useCase.execute(listing.id.toString()); // sin requesterId

        expect(result.hiddenFields.length).toBeGreaterThan(0);
    });

    it('debería ocultar datos si el NDA existe pero NO está completamente firmado', async () => {
        const listing = createPublishedListing(true);
        const buyerId = new UniqueEntityID();

        // NDA firmado solo por buyer, falta platform
        const nda = Contract.createBuyerNda(listing.id, buyerId);
        nda.attachDocument('a'.repeat(64));
        nda.sign('buyer', '127.0.0.1');

        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(listing),
        });
        const contractRepo = createMockContractRepo({
            findByListingAndSigner: vi.fn().mockResolvedValue(nda),
        });

        const useCase = new GetListingDetailsUseCase(listingRepo, contractRepo);
        const result = await useCase.execute(listing.id.toString(), actorDe(buyerId, UserRole.BUYER));

        expect(result.hiddenFields.length).toBeGreaterThan(0);
    });
});
