import { describe, it, expect, vi } from 'vitest';
import { AcceptOfferUseCase } from '../../../src/use-cases/negotiation/AcceptOfferUseCase';
import {
    IUnitOfWork,
    TransactionalRepositories,
} from '../../../src/ports/IUnitOfWork';
import {
    IUserRepository,
    IListingRepository,
    IOperationRepository,
    IContractRepository,
} from '../../../src/ports/Repositories';
import { Actor } from '../../../src/ports/Actor';
import { Operation } from '../../../src/entities/Operation';
import { Listing } from '../../../src/entities/Listing';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { UserRole } from '@marketplace/shared-types';

/**
 * La cascada híbrida toca varias filas: acepta una oferta, cancela todas las
 * rivales del mismo listing y mueve el listing a `in_operation`. Si eso no es
 * atómico, una falla a mitad de camino deja una oferta aceptada conviviendo
 * con ofertas rivales todavía vivas — el estado que el modelo multi-oferta
 * justamente prohíbe.
 *
 * Estos tests fijan que el use case delega TODO el trabajo a una única
 * transacción, sin tocar repositorios por fuera de ella.
 */

// ── Dobles ───────────────────────────────────────────────

function createMockUserRepo(overrides: Partial<IUserRepository> = {}): IUserRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findByEmail: vi.fn().mockResolvedValue(null),
        findByRole: vi.fn().mockResolvedValue([]),
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
        findByStatuses: vi.fn().mockResolvedValue([]),
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

/**
 * Unit of Work de prueba: ejecuta el bloque en el acto y recuerda si lo hizo.
 * No simula rollback — eso se verifica contra Postgres en packages/db. Acá se
 * verifica el contrato: que el use case pida una transacción y trabaje dentro.
 */
function createFakeUnitOfWork(repos: TransactionalRepositories): IUnitOfWork & { corridas: number } {
    let corridas = 0;
    return {
        get corridas() {
            return corridas;
        },
        async run<T>(work: (r: TransactionalRepositories) => Promise<T>): Promise<T> {
            corridas += 1;
            return work(repos);
        },
    };
}

// ── Fixtures ─────────────────────────────────────────────

const SELLER_ID = new UniqueEntityID();
const LISTING_ID = new UniqueEntityID();

function unaOferta(buyerId = new UniqueEntityID()): Operation {
    return Operation.create({
        listingId: LISTING_ID,
        buyerId,
        sellerId: SELLER_ID,
        offerPrice: Money.fromCents(100000, 'USD'),
    });
}

function unListingPublicado(): Listing {
    const listing = Listing.create({
        sellerId: SELLER_ID,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(50000, 'USD'),
            subscribers: 10000,
            isMonetized: true,
        }),
        askingPrice: Money.fromCents(1000000, 'USD'),
    });
    listing.submitForReview();
    listing.approve();
    return listing;
}

const SELLER: Actor = { id: SELLER_ID.toString(), role: UserRole.SELLER };

// ═════════════════════════════════════════════════════════

describe('AcceptOfferUseCase — atomicidad de la cascada', () => {
    it('ejecuta toda la cascada dentro de una única transacción', async () => {
        const aceptada = unaOferta();
        const rival1 = unaOferta();
        const rival2 = unaOferta();
        const listing = unListingPublicado();

        const repos: TransactionalRepositories = {
            users: createMockUserRepo(),
            listings: createMockListingRepo({
                findById: vi.fn().mockResolvedValue(listing),
            }),
            operations: createMockOperationRepo({
                findById: vi.fn().mockResolvedValue(aceptada),
                findByListing: vi.fn().mockResolvedValue([aceptada, rival1, rival2]),
            }),
            contracts: createMockContractRepo(),
        };
        const uow = createFakeUnitOfWork(repos);

        await new AcceptOfferUseCase(uow).execute(aceptada.id.toString(), SELLER);

        expect(uow.corridas).toBe(1);
        expect(aceptada.status).toBe('contract_pending');
        expect(rival1.status).toBe('cancelled');
        expect(rival2.status).toBe('cancelled');
        expect(listing.status).toBe('in_operation');
    });

    it('propaga la falla si algo revienta a mitad de la cascada', async () => {
        const aceptada = unaOferta();
        const rival = unaOferta();

        const repos: TransactionalRepositories = {
            users: createMockUserRepo(),
            listings: createMockListingRepo({
                findById: vi.fn().mockResolvedValue(unListingPublicado()),
            }),
            operations: createMockOperationRepo({
                findById: vi.fn().mockResolvedValue(aceptada),
                findByListing: vi.fn().mockResolvedValue([aceptada, rival]),
                // Falla al guardar la cancelación de la rival.
                save: vi.fn()
                    .mockResolvedValueOnce(undefined)
                    .mockRejectedValueOnce(new Error('conexión perdida')),
            }),
            contracts: createMockContractRepo(),
        };
        const uow = createFakeUnitOfWork(repos);

        await expect(
            new AcceptOfferUseCase(uow).execute(aceptada.id.toString(), SELLER),
        ).rejects.toThrow('conexión perdida');

        // El error sube: es la transacción la que revierte, no el use case.
        expect(uow.corridas).toBe(1);
    });

    /**
     * La garantía de "no escribe fuera de la transacción" no es un test sino
     * el constructor: AcceptOfferUseCase solo recibe el IUnitOfWork, así que
     * no tiene ningún repositorio suelto al que escribirle.
     */
});
