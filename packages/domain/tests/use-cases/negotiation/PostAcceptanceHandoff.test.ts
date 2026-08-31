import { describe, it, expect, vi } from 'vitest';
import { AcceptOfferUseCase } from '../../../src/use-cases/negotiation/AcceptOfferUseCase';
import { Listing } from '../../../src/entities/Listing';
import { Operation } from '../../../src/entities/Operation';
import { Contract } from '../../../src/entities/Contract';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { Actor } from '../../../src/ports/Actor';
import { IUnitOfWork, TransactionalRepositories } from '../../../src/ports/IUnitOfWork';
import {
    IContractRepository,
    IListingRepository,
    IOperationRepository,
    IUserRepository,
} from '../../../src/ports/Repositories';
import { UserRole } from '@marketplace/shared-types';

/*
 * El traspaso de la negociación al contrato.
 *
 * Aceptar una oferta deja la operación en `contract_pending`, y a partir de
 * ahí lo único que la mueve es que las partes firmen el tripartito. Si nadie
 * lo crea, no hay nada que firmar: la operación queda detenida para siempre y
 * ni el comprador, ni el vendedor, ni la plataforma tienen una acción
 * disponible. Es el bloqueo que estas pruebas cubren.
 */

function actorDe(id: UniqueEntityID | string, role = UserRole.SELLER): Actor {
    return { id: typeof id === 'string' ? id : id.toString(), role };
}

function createTestStrategy() {
    return new YouTubeStrategy({
        monthlyRevenueUsd: Money.fromCents(50000, 'USD'),
        subscribers: 10000,
        growthFactor: 1.2,
        isMonetized: true,
    });
}

function createListingInOperation(sellerId: UniqueEntityID) {
    const listing = Listing.create({
        sellerId,
        assetStrategy: createTestStrategy(),
        askingPrice: Money.fromCents(1000000, 'USD'),
    });
    listing.submitForReview();
    listing.approve();
    return listing;
}

/** Una operación con la oferta del comprador esperando respuesta del vendedor. */
function createPendingOffer(listing: Listing, buyerId: UniqueEntityID, sellerId: UniqueEntityID) {
    return Operation.create({
        listingId: listing.id,
        buyerId,
        sellerId,
        offerPrice: Money.fromCents(800000, 'USD'),
    });
}

interface Escenario {
    uow: IUnitOfWork;
    contracts: IContractRepository;
    listings: IListingRepository;
    operations: IOperationRepository;
    guardados: Contract[];
}

/**
 * El doble ejecuta el bloque en el acto con los repos que se le pasan; el
 * rollback real se prueba en packages/db.
 */
function armarEscenario(listing: Listing, operation: Operation, rivales: Operation[] = []): Escenario {
    const guardados: Contract[] = [];

    const users: IUserRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findByEmail: vi.fn().mockResolvedValue(null),
        findByRole: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
    const contracts: IContractRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findByOperation: vi.fn().mockResolvedValue([]),
        findByListingAndSigner: vi.fn().mockResolvedValue(null),
        findAllByListing: vi.fn().mockResolvedValue([]),
        save: vi.fn(async (c: Contract) => {
            guardados.push(c);
        }),
    };
    const listings: IListingRepository = {
        findById: vi.fn().mockResolvedValue(listing),
        findPublished: vi.fn().mockResolvedValue([]),
        findBySeller: vi.fn().mockResolvedValue([]),
        findByStatus: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
    const operations: IOperationRepository = {
        findById: vi.fn().mockResolvedValue(operation),
        findByListing: vi.fn().mockResolvedValue([operation, ...rivales]),
        findByParty: vi.fn().mockResolvedValue([]),
        findByStatuses: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };

    const uow: IUnitOfWork = {
        run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T> {
            return work({ users, listings, operations, contracts });
        },
    };

    return { uow, contracts, listings, operations, guardados };
}

describe('AcceptOfferUseCase — el contrato que cierra la venta', () => {
    it('debería crear el contrato tripartito al aceptar la oferta', async () => {
        const sellerId = new UniqueEntityID();
        const buyerId = new UniqueEntityID();
        const listing = createListingInOperation(sellerId);
        const operation = createPendingOffer(listing, buyerId, sellerId);

        const e = armarEscenario(listing, operation);
        await new AcceptOfferUseCase(e.uow).execute(operation.id.toString(), actorDe(sellerId));

        expect(operation.status).toBe('contract_pending');

        // Sin esto la operación queda en contract_pending sin nada que firmar.
        const tripartito = e.guardados.find((c) => c.type === 'tripartite');
        expect(tripartito).toBeDefined();
        expect(tripartito!.operationId?.toString()).toBe(operation.id.toString());
        expect(tripartito!.listingId.toString()).toBe(listing.id.toString());
    });

    it('debería dejar el tripartito sin firmas: firmarlo es un acto aparte', async () => {
        const sellerId = new UniqueEntityID();
        const buyerId = new UniqueEntityID();
        const listing = createListingInOperation(sellerId);
        const operation = createPendingOffer(listing, buyerId, sellerId);

        const e = armarEscenario(listing, operation);
        await new AcceptOfferUseCase(e.uow).execute(operation.id.toString(), actorDe(sellerId));

        const tripartito = e.guardados.find((c) => c.type === 'tripartite')!;
        expect(tripartito.isFullySigned()).toBe(false);
        expect(tripartito.signatures.every((f) => !f.signed)).toBe(true);
    });

    it('no debería crear un segundo tripartito si la operación ya tiene uno', async () => {
        const sellerId = new UniqueEntityID();
        const buyerId = new UniqueEntityID();
        const listing = createListingInOperation(sellerId);
        const operation = createPendingOffer(listing, buyerId, sellerId);

        const e = armarEscenario(listing, operation);
        // Un reintento sobre una operación que ya lo tiene no debe duplicarlo:
        // la base tiene una única fila por operación y tipo.
        (e.contracts.findByOperation as ReturnType<typeof vi.fn>).mockResolvedValue([
            Contract.createTripartite(listing.id, operation.id),
        ]);

        await new AcceptOfferUseCase(e.uow).execute(operation.id.toString(), actorDe(sellerId));

        expect(e.guardados.filter((c) => c.type === 'tripartite')).toHaveLength(0);
    });

    it('no debería crearle contrato a las ofertas rivales que la cascada cancela', async () => {
        const sellerId = new UniqueEntityID();
        const listing = createListingInOperation(sellerId);
        const ganadora = createPendingOffer(listing, new UniqueEntityID(), sellerId);
        const rival = createPendingOffer(listing, new UniqueEntityID(), sellerId);

        const e = armarEscenario(listing, ganadora, [rival]);
        await new AcceptOfferUseCase(e.uow).execute(ganadora.id.toString(), actorDe(sellerId));

        expect(rival.status).toBe('cancelled');
        const tripartitos = e.guardados.filter((c) => c.type === 'tripartite');
        expect(tripartitos).toHaveLength(1);
        expect(tripartitos[0].operationId?.toString()).toBe(ganadora.id.toString());
    });
});
