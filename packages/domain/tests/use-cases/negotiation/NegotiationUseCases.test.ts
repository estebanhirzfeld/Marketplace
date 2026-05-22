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

// ── Mock Factories ───────────────────────────────────────

function createMockOperationRepo(overrides: Partial<IOperationRepository> = {}): IOperationRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findByListing: vi.fn().mockResolvedValue([]),
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
        isBlind: false,
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
            buyerId: buyerId.toString(),
            offerPrice: { cents: 800000, currency: 'USD' },
        });

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
            buyerId: new UniqueEntityID().toString(),
            offerPrice: { cents: 800000, currency: 'USD' },
        })).rejects.toThrow('Listing no encontrado');
    });

    it('debería fallar si el listing no está publicado', async () => {
        const listing = Listing.create({
            sellerId: new UniqueEntityID(),
            assetStrategy: createTestStrategy(),
            askingPrice: Money.fromCents(1000000, 'USD'),
            isBlind: false,
        }); // status = draft

        const listingRepo = createMockListingRepo({
            findById: vi.fn().mockResolvedValue(listing),
        });
        const operationRepo = createMockOperationRepo();

        const useCase = new CreateOfferUseCase(operationRepo, listingRepo);
        await expect(useCase.execute({
            listingId: listing.id.toString(),
            buyerId: new UniqueEntityID().toString(),
            offerPrice: { cents: 800000, currency: 'USD' },
        })).rejects.toThrow('Solo se puede ofertar sobre listings publicados');
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
            buyerId: sellerId.toString(), // mismo que el seller!
            offerPrice: { cents: 800000, currency: 'USD' },
        })).rejects.toThrow('No podés ofertar sobre tu propio listing');
    });
});

// ═════════════════════════════════════════════════════════
// CounterOfferUseCase
// ═════════════════════════════════════════════════════════

describe('CounterOfferUseCase', () => {
    it('debería agregar una contraoferta', async () => {
        const operation = Operation.create({
            listingId: new UniqueEntityID(),
            buyerId: new UniqueEntityID(),
            sellerId: new UniqueEntityID(),
            offerPrice: Money.fromCents(100000, 'USD'),
        });

        const operationRepo = createMockOperationRepo({
            findById: vi.fn().mockResolvedValue(operation),
        });

        const useCase = new CounterOfferUseCase(operationRepo);
        await useCase.execute({
            operationId: operation.id.toString(),
            price: { cents: 150000, currency: 'USD' },
            by: 'seller',
        });

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
            by: 'seller',
        })).rejects.toThrow('Operación no encontrada');
    });

    it('debería fallar si no es el turno de quien contraoferta', async () => {
        const operation = Operation.create({
            listingId: new UniqueEntityID(),
            buyerId: new UniqueEntityID(),
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
            by: 'buyer', // no es su turno
        })).rejects.toThrow('No es el turno de buyer');
    });
});

// ═════════════════════════════════════════════════════════
// AcceptOfferUseCase (Cascada Híbrida)
// ═════════════════════════════════════════════════════════

describe('AcceptOfferUseCase', () => {
    it('debería aceptar la oferta y calcular comisiones', async () => {
        const operation = Operation.create({
            listingId: new UniqueEntityID(),
            buyerId: new UniqueEntityID(),
            sellerId: new UniqueEntityID(),
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

        const useCase = new AcceptOfferUseCase(operationRepo, listingRepo);
        await useCase.execute(operation.id.toString(), 'seller');

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

        const useCase = new AcceptOfferUseCase(operationRepo, listingRepo);
        await useCase.execute(op2.id.toString(), 'seller');

        // op2 aceptada
        expect(op2.status).toBe('contract_pending');
        // op1 y op3 canceladas
        expect(op1.status).toBe('cancelled');
        expect(op3.status).toBe('cancelled');
        // 3 saves: op2 (aceptada) + op1 (cancelada) + op3 (cancelada)
        expect(operationRepo.save).toHaveBeenCalledTimes(3);
    });

    it('debería transicionar el listing a in_operation', async () => {
        const operation = Operation.create({
            listingId: new UniqueEntityID(),
            buyerId: new UniqueEntityID(),
            sellerId: new UniqueEntityID(),
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

        const useCase = new AcceptOfferUseCase(operationRepo, listingRepo);
        await useCase.execute(operation.id.toString(), 'seller');

        expect(listing.status).toBe('in_operation');
        expect(listingRepo.save).toHaveBeenCalledOnce();
    });
});

// ═════════════════════════════════════════════════════════
// CancelOperationUseCase
// ═════════════════════════════════════════════════════════

describe('CancelOperationUseCase', () => {
    it('debería cancelar una operación en offer_sent', async () => {
        const operation = Operation.create({
            listingId: new UniqueEntityID(),
            buyerId: new UniqueEntityID(),
            sellerId: new UniqueEntityID(),
            offerPrice: Money.fromCents(100000, 'USD'),
        });

        const operationRepo = createMockOperationRepo({
            findById: vi.fn().mockResolvedValue(operation),
        });

        const useCase = new CancelOperationUseCase(operationRepo);
        await useCase.execute(operation.id.toString());

        expect(operation.status).toBe('cancelled');
        expect(operationRepo.save).toHaveBeenCalledOnce();
    });

    it('debería fallar si la operación no existe', async () => {
        const operationRepo = createMockOperationRepo();
        const useCase = new CancelOperationUseCase(operationRepo);

        await expect(useCase.execute('nonexistent'))
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
        await expect(useCase.execute(operation.id.toString()))
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

        const useCase = new GetSellerOffersUseCase(operationRepo);
        const result = await useCase.execute(listingId.toString());

        expect(result).toHaveLength(1);
        expect(result[0].id.toString()).toBe(active.id.toString());
    });

    it('debería devolver array vacío si no hay operaciones', async () => {
        const operationRepo = createMockOperationRepo();
        const useCase = new GetSellerOffersUseCase(operationRepo);

        const result = await useCase.execute('some-listing-id');
        expect(result).toHaveLength(0);
    });
});
