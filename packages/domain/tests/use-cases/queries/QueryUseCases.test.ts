import { describe, it, expect, vi } from 'vitest';
import { GetMyListingsUseCase } from '../../../src/use-cases/listing/GetMyListingsUseCase';
import { GetListingsForReviewUseCase } from '../../../src/use-cases/listing/GetListingsForReviewUseCase';
import { GetMyOperationsUseCase } from '../../../src/use-cases/operation/GetMyOperationsUseCase';
import { GetOperationDetailsUseCase } from '../../../src/use-cases/operation/GetOperationDetailsUseCase';
import {
    IListingRepository,
    IOperationRepository,
    IContractRepository,
    IUserRepository,
} from '../../../src/ports/Repositories';
import { Actor } from '../../../src/ports/Actor';
import { Operation } from '../../../src/entities/Operation';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { ForbiddenError, NotFoundError } from '../../../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

// ── Mock Factories ───────────────────────────────────────

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

const BUYER_ID = new UniqueEntityID();
const SELLER_ID = new UniqueEntityID();

function actorDe(id: UniqueEntityID | string, role = UserRole.BUYER): Actor {
    return { id: typeof id === 'string' ? id : id.toString(), role };
}

function unaOperacion(): Operation {
    return Operation.create({
        listingId: new UniqueEntityID(),
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        offerPrice: Money.fromCents(100000, 'USD'),
    });
}

// ═════════════════════════════════════════════════════════

describe('GetMyListingsUseCase', () => {
    it('consulta por el id del actor, no por uno recibido', async () => {
        const repo = createMockListingRepo();
        const actor = actorDe(SELLER_ID, UserRole.SELLER);

        await new GetMyListingsUseCase(repo).execute(actor);

        // La garantía no es un chequeo de permisos: es que no hay forma de
        // pedir los listings de otro, porque el id sale del actor.
        expect(repo.findBySeller).toHaveBeenCalledWith(SELLER_ID.toString());
    });
});

describe('GetListingsForReviewUseCase', () => {
    it('devuelve la cola de revisión a un admin', async () => {
        const repo = createMockListingRepo();

        await new GetListingsForReviewUseCase(repo).execute(actorDe('admin', UserRole.ADMIN));

        expect(repo.findByStatus).toHaveBeenCalledWith('under_review');
    });

    it('rechaza a quien no es admin', async () => {
        const useCase = new GetListingsForReviewUseCase(createMockListingRepo());

        await expect(useCase.execute(actorDe(SELLER_ID, UserRole.SELLER)))
            .rejects.toThrow(ForbiddenError);
    });
});

describe('GetMyOperationsUseCase', () => {
    it('consulta por el id del actor', async () => {
        const repo = createMockOperationRepo();

        await new GetMyOperationsUseCase(repo).execute(actorDe(BUYER_ID));

        expect(repo.findByParty).toHaveBeenCalledWith(BUYER_ID.toString());
    });
});

describe('GetOperationDetailsUseCase', () => {
    /**
     * El repositorio de usuarios devuelve `null`: la vista tiene que resolver
     * igual. Un usuario dado de baja no puede dejar la operación inaccesible
     * para su contraparte, que sigue necesitando el historial.
     */
    const usuariosVacios: IUserRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findByEmail: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockResolvedValue(undefined),
    };

    function armar(operacion: Operation | null) {
        return new GetOperationDetailsUseCase(
            createMockOperationRepo({ findById: vi.fn().mockResolvedValue(operacion) }),
            createMockContractRepo(),
            usuariosVacios,
            // El activo se resuelve para poder nombrarlo; que no esté no
            // impide abrir la operación, y estos casos no lo miran.
            createMockListingRepo(),
        );
    }

    it('le dice al comprador que su parte es buyer', async () => {
        const op = unaOperacion();
        const vista = await armar(op).execute(op.id.toString(), actorDe(BUYER_ID));

        expect(vista.miParte).toBe('buyer');
    });

    it('le dice al vendedor que su parte es seller', async () => {
        const op = unaOperacion();
        const vista = await armar(op).execute(op.id.toString(), actorDe(SELLER_ID, UserRole.SELLER));

        expect(vista.miParte).toBe('seller');
    });

    it('rechaza a un tercero', async () => {
        const op = unaOperacion();

        await expect(armar(op).execute(op.id.toString(), actorDe(new UniqueEntityID())))
            .rejects.toThrow(ForbiddenError);
    });

    /**
     * El admin ejecuta custodia, pago y cierre: necesita ver la operación
     * aunque no sea parte. Entra por rol y sin posición propia.
     */
    it('deja entrar a un admin ajeno, sin asignarle parte', async () => {
        const op = unaOperacion();
        const vista = await armar(op).execute(op.id.toString(), actorDe('admin', UserRole.ADMIN));

        expect(vista.miParte).toBeUndefined();
        expect(vista.operation.id.toString()).toBe(op.id.toString());
    });

    it('falla si la operación no existe', async () => {
        await expect(armar(null).execute('no-existe', actorDe(BUYER_ID)))
            .rejects.toThrow(NotFoundError);
    });
});
