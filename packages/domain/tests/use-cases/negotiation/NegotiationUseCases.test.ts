import { describe, it, expect, vi } from 'vitest';
import { CreateOfferUseCase } from '../../../src/use-cases/negotiation/CreateOfferUseCase';
import { CounterOfferUseCase } from '../../../src/use-cases/negotiation/CounterOfferUseCase';
import { AcceptOfferUseCase } from '../../../src/use-cases/negotiation/AcceptOfferUseCase';
import { CancelOperationUseCase } from '../../../src/use-cases/negotiation/CancelOperationUseCase';
import { GetSellerOffersUseCase } from '../../../src/use-cases/negotiation/GetSellerOffersUseCase';
import { IOperationRepository, IListingRepository } from '../../../src/ports/Repositories';
import { Listing } from '../../../src/entities/Listing';
import { Operation } from '../../../src/entities/Operation';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { Actor } from '../../../src/ports/Actor';
import { IUnitOfWork, TransactionalRepositories } from '../../../src/ports/IUnitOfWork';
import { IUserRepository, IContractRepository } from '../../../src/ports/Repositories';
import { ForbiddenError } from '../../../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

function actorDe(id: UniqueEntityID | string, role = UserRole.BUYER): Actor {
    return { id: typeof id === 'string' ? id : id.toString(), role };
}

/**
 * AcceptOffer trabaja dentro de una transacción, así que recibe un Unit of
 * Work en vez de repositorios sueltos. Este doble ejecuta el bloque en el acto
 * con los repos que se le pasan; el rollback real se prueba en packages/db.
 */
function createFakeUnitOfWork(
    operations: IOperationRepository,
    listings: IListingRepository,
): IUnitOfWork {
    const users: IUserRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findByEmail: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockResolvedValue(undefined),
    };
    const contracts: IContractRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findByOperation: vi.fn().mockResolvedValue([]),
        findByListingAndSigner: vi.fn().mockResolvedValue(null),
        findAllByListing: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };

    return {
        run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T> {
            return work({ users, listings, operations, contracts });
        },
    };
}

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

function createTestStrategy() {
    return new YouTubeStrategy({
        monthlyRevenueUsd: Money.fromCents(50000, 'USD'),
        subscribers: 10000,
        growthFactor: 1.2,
        isMonetized: true,
    });
}

function createPublishedListing(sellerId?: UniqueEntityID) {
    const listing = Listing.create({
        sellerId: sellerId ?? new UniqueEntityID(),
        assetStrategy: createTestStrategy(),
        askingPrice: Money.fromCents(1000000, 'USD'),
    });
    listing.submitForReview();
    listing.approve();
    return listing;
}

// ═════════════════════════════════════════════════════════
// CreateOfferUseCase
// ═════════════════════════════════════════════════════════

describe('CreateOfferUseCase', () => {
    it('debería crear una oferta sobre un listing publicado', async () => {
        const sellerId = new UniqueEntityID();
        const buyerId = new UniqueEntityID();
        const listing = createPublishedListing(sellerId);

        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(listing),
        });
        const operationRepo = createMockOperationRepo();

        const useCase = new CreateOfferUseCase(operationRepo, listingRepo);
        const result = await useCase.execute({
            listingId: listing.id.toString(),
            offerPrice: { cents: 800000, currency: 'USD' },
        }, actorDe(buyerId));

        expect(result.status).toBe('offer_sent');
        expect(result.currentOfferPrice.getCents()).toBe(800000);
        expect(operationRepo.save).toHaveBeenCalledOnce();
    });

    it('debería fallar si el listing no existe', async () => {
        const operationRepo = createMockOperationRepo();
        const listingRepo = createMockListingRepo();

        const useCase = new CreateOfferUseCase(operationRepo, listingRepo);
        await expect(useCase.execute({
            listingId: 'nonexistent',
            offerPrice: { cents: 800000, currency: 'USD' },
        }, actorDe(new UniqueEntityID()))).rejects.toThrow('Activo no encontrado');
    });

    it('debería fallar si el listing no está publicado', async () => {
        const listing = Listing.create({
            sellerId: new UniqueEntityID(),
            assetStrategy: createTestStrategy(),
            askingPrice: Money.fromCents(1000000, 'USD'),
        }); // status = draft

        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(listing),
        });
        const operationRepo = createMockOperationRepo();

        const useCase = new CreateOfferUseCase(operationRepo, listingRepo);
        await expect(useCase.execute({
            listingId: listing.id.toString(),
            offerPrice: { cents: 800000, currency: 'USD' },
        }, actorDe(new UniqueEntityID()))).rejects.toThrow('Solo se puede ofertar sobre activos publicados');
    });

    it('debería fallar si el buyer es el seller', async () => {
        const sellerId = new UniqueEntityID();
        const listing = createPublishedListing(sellerId);

        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(listing),
        });
        const operationRepo = createMockOperationRepo();

        const useCase = new CreateOfferUseCase(operationRepo, listingRepo);
        await expect(useCase.execute({
            listingId: listing.id.toString(),
            offerPrice: { cents: 800000, currency: 'USD' },
        }, actorDe(sellerId))).rejects.toThrow('No podés ofertar sobre tu propio activo');
    });
});

// ═════════════════════════════════════════════════════════
// CounterOfferUseCase
// ═════════════════════════════════════════════════════════

describe('CounterOfferUseCase', () => {
    it('debería agregar una contraoferta', async () => {
        const sellerId = new UniqueEntityID();
        const operation = Operation.create({
            listingId: new UniqueEntityID(),
            buyerId: new UniqueEntityID(),
            sellerId,
            offerPrice: Money.fromCents(100000, 'USD'),
        });

        const operationRepo = createMockOperationRepo({
            findById: vi.fn().mockResolvedValue(operation),
        });

        const useCase = new CounterOfferUseCase(operationRepo);
        await useCase.execute({
            operationId: operation.id.toString(),
            price: { cents: 150000, currency: 'USD' },
        }, actorDe(sellerId, UserRole.SELLER));

        expect(operation.status).toBe('negotiating');
        expect(operation.currentOfferPrice.getCents()).toBe(150000);
        expect(operationRepo.save).toHaveBeenCalledOnce();
    });

    it('debería fallar si la operación no existe', async () => {
        const operationRepo = createMockOperationRepo();
        const useCase = new CounterOfferUseCase(operationRepo);

        await expect(useCase.execute({
            operationId: 'nonexistent',
            price: { cents: 150000, currency: 'USD' },
        }, actorDe(new UniqueEntityID()))).rejects.toThrow('Operación no encontrada');
    });

    it('debería fallar si no es el turno de quien contraoferta', async () => {
        const buyerId = new UniqueEntityID();
        const operation = Operation.create({
            listingId: new UniqueEntityID(),
            buyerId,
            sellerId: new UniqueEntityID(),
            offerPrice: Money.fromCents(100000, 'USD'),
        }); // turno del seller

        const operationRepo = createMockOperationRepo({
            findById: vi.fn().mockResolvedValue(operation),
        });

        const useCase = new CounterOfferUseCase(operationRepo);
        await expect(useCase.execute({
            operationId: operation.id.toString(),
            price: { cents: 150000, currency: 'USD' },
        }, actorDe(buyerId))).rejects.toThrow('No es el turno de buyer');
    });

    it('rechaza a un tercero ajeno a la operación', async () => {
        const operation = Operation.create({
            listingId: new UniqueEntityID(),
            buyerId: new UniqueEntityID(),
            sellerId: new UniqueEntityID(),
            offerPrice: Money.fromCents(100000, 'USD'),
        });

        const useCase = new CounterOfferUseCase(createMockOperationRepo({
            findById: vi.fn().mockResolvedValue(operation),
        }));

        await expect(useCase.execute({
            operationId: operation.id.toString(),
            price: { cents: 150000, currency: 'USD' },
        }, actorDe(new UniqueEntityID()))).rejects.toThrow(ForbiddenError);
    });
});

// ═════════════════════════════════════════════════════════
// AcceptOfferUseCase (Cascada Híbrida)
// ═════════════════════════════════════════════════════════

describe('AcceptOfferUseCase', () => {
    it('debería aceptar la oferta y calcular comisiones', async () => {
        const sellerId = new UniqueEntityID();
        const operation = Operation.create({
            listingId: new UniqueEntityID(),
            buyerId: new UniqueEntityID(),
            sellerId,
            offerPrice: Money.fromCents(200000, 'USD'),
        });

        const listing = createPublishedListing();
        const operationRepo = createMockOperationRepo({
            findById: vi.fn().mockResolvedValue(operation),
            findByListing: vi.fn().mockResolvedValue([operation]),
        });
        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(listing),
        });

        const useCase = new AcceptOfferUseCase(createFakeUnitOfWork(operationRepo, listingRepo));
        await useCase.execute(operation.id.toString(), actorDe(sellerId, UserRole.SELLER));

        expect(operation.status).toBe('contract_pending');
        expect(operation.finalPrice?.getCents()).toBe(200000);
    });

    it('debería cancelar las demás operaciones del listing (cascada híbrida)', async () => {
        const listingId = new UniqueEntityID();
        const sellerId = new UniqueEntityID();

        // 3 ofertas sobre el mismo listing
        const op1 = Operation.create({
            listingId, buyerId: new UniqueEntityID(), sellerId,
            offerPrice: Money.fromCents(100000, 'USD'),
        });
        const op2 = Operation.create({
            listingId, buyerId: new UniqueEntityID(), sellerId,
            offerPrice: Money.fromCents(150000, 'USD'),
        });
        const op3 = Operation.create({
            listingId, buyerId: new UniqueEntityID(), sellerId,
            offerPrice: Money.fromCents(200000, 'USD'),
        });

        const listing = createPublishedListing();
        const operationRepo = createMockOperationRepo({
            findById: vi.fn().mockResolvedValue(op2), // aceptamos op2
            findByListing: vi.fn().mockResolvedValue([op1, op2, op3]),
        });
        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(listing),
        });

        const useCase = new AcceptOfferUseCase(createFakeUnitOfWork(operationRepo, listingRepo));
        await useCase.execute(op2.id.toString(), actorDe(sellerId, UserRole.SELLER));

        // op2 aceptada
        expect(op2.status).toBe('contract_pending');
        // op1 y op3 canceladas
        expect(op1.status).toBe('cancelled');
        expect(op3.status).toBe('cancelled');
        // 3 saves: op2 (aceptada) + op1 (cancelada) + op3 (cancelada)
        expect(operationRepo.save).toHaveBeenCalledTimes(3);
    });

    it('debería transicionar el listing a in_operation', async () => {
        const sellerId = new UniqueEntityID();
        const operation = Operation.create({
            listingId: new UniqueEntityID(),
            buyerId: new UniqueEntityID(),
            sellerId,
            offerPrice: Money.fromCents(200000, 'USD'),
        });

        const listing = createPublishedListing();
        const operationRepo = createMockOperationRepo({
            findById: vi.fn().mockResolvedValue(operation),
            findByListing: vi.fn().mockResolvedValue([operation]),
        });
        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(listing),
        });

        const useCase = new AcceptOfferUseCase(createFakeUnitOfWork(operationRepo, listingRepo));
        await useCase.execute(operation.id.toString(), actorDe(sellerId, UserRole.SELLER));

        expect(listing.status).toBe('in_operation');
        expect(listingRepo.save).toHaveBeenCalledOnce();
    });
});

// ═════════════════════════════════════════════════════════
// CancelOperationUseCase
// ═════════════════════════════════════════════════════════

describe('CancelOperationUseCase', () => {
    it('debería cancelar una operación en offer_sent', async () => {
        const buyerId = new UniqueEntityID();
        const operation = Operation.create({
            listingId: new UniqueEntityID(),
            buyerId,
            sellerId: new UniqueEntityID(),
            offerPrice: Money.fromCents(100000, 'USD'),
        });

        const operationRepo = createMockOperationRepo({
            findById: vi.fn().mockResolvedValue(operation),
        });

        const useCase = new CancelOperationUseCase(operationRepo);
        await useCase.execute(operation.id.toString(), actorDe(buyerId));

        expect(operation.status).toBe('cancelled');
        expect(operationRepo.save).toHaveBeenCalledOnce();
    });

    it('debería fallar si la operación no existe', async () => {
        const operationRepo = createMockOperationRepo();
        const useCase = new CancelOperationUseCase(operationRepo);

        await expect(useCase.execute('nonexistent', actorDe(new UniqueEntityID())))
            .rejects.toThrow('Operación no encontrada');
    });

    it('debería fallar al cancelar una operación con contrato firmado', async () => {
        const operation = Operation.create({
            listingId: new UniqueEntityID(),
            buyerId: new UniqueEntityID(),
            sellerId: new UniqueEntityID(),
            offerPrice: Money.fromCents(100000, 'USD'),
        });
        operation.acceptCurrentOffer('seller');
        operation.signContract();

        const operationRepo = createMockOperationRepo({
            findById: vi.fn().mockResolvedValue(operation),
        });

        const useCase = new CancelOperationUseCase(operationRepo);
        await expect(useCase.execute(operation.id.toString(), actorDe(operation.toSnapshot().props.buyerId)))
            .rejects.toThrow('No se puede cancelar');
    });
});

// ═════════════════════════════════════════════════════════
// GetSellerOffersUseCase
// ═════════════════════════════════════════════════════════

describe('GetSellerOffersUseCase', () => {
    it('debería devolver solo operaciones activas', async () => {
        const listingId = new UniqueEntityID();
        const sellerId = new UniqueEntityID();

        const active = Operation.create({
            listingId, buyerId: new UniqueEntityID(), sellerId,
            offerPrice: Money.fromCents(100000, 'USD'),
        });
        const cancelled = Operation.create({
            listingId, buyerId: new UniqueEntityID(), sellerId,
            offerPrice: Money.fromCents(150000, 'USD'),
        });
        cancelled.cancel();

        const operationRepo = createMockOperationRepo({
            findByListing: vi.fn().mockResolvedValue([active, cancelled]),
        });
        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(createPublishedListing(sellerId)),
        });

        const useCase = new GetSellerOffersUseCase(operationRepo, listingRepo);
        const result = await useCase.execute(listingId.toString(), actorDe(sellerId, UserRole.SELLER));

        expect(result).toHaveLength(1);
        expect(result[0].id.toString()).toBe(active.id.toString());
    });

    it('debería devolver array vacío si no hay operaciones', async () => {
        const sellerId = new UniqueEntityID();
        const useCase = new GetSellerOffersUseCase(
            createMockOperationRepo(),
            createMockListingRepo({
                findById: vi.fn().mockResolvedValue(createPublishedListing(sellerId)),
            }),
        );

        const result = await useCase.execute('some-listing-id', actorDe(sellerId, UserRole.SELLER));
        expect(result).toHaveLength(0);
    });

    // Preserva el carácter de licitación a sobre cerrado: un buyer no puede
    // ver las ofertas rivales sobre el mismo listing.
    it('rechaza a quien no es dueño del listing', async () => {
        const useCase = new GetSellerOffersUseCase(
            createMockOperationRepo(),
            createMockListingRepo({
                findById: vi.fn().mockResolvedValue(createPublishedListing(new UniqueEntityID())),
            }),
        );

        await expect(useCase.execute('some-listing-id', actorDe(new UniqueEntityID())))
            .rejects.toThrow(ForbiddenError);
    });
});
