import { describe, it, expect, vi } from 'vitest';
import {
    CreateCustodyAccountUseCase,
    UpdateCustodyAccountUseCase,
    ActivateCustodyAccountUseCase,
    DeactivateCustodyAccountUseCase,
    ListCustodyAccountsUseCase,
} from '../../../src/use-cases/admin/CustodyAccountUseCases';
import { CustodyAccount } from '../../../src/entities/CustodyAccount';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { Actor } from '../../../src/ports/Actor';
import { ForbiddenError, InvalidStateError, NotFoundError } from '../../../src/errors/DomainError';
import { AssetType, UserRole } from '@marketplace/shared-types';
import {
    ICustodyAccountRepository,
    IListingRepository,
} from '../../../src/ports/Repositories';

const ADMIN: Actor = { id: 'admin-1', role: UserRole.ADMIN };
const BUYER: Actor = { id: 'buyer-1', role: UserRole.BUYER };
const SELLER: Actor = { id: 'seller-1', role: UserRole.SELLER };

function unaCuenta(over: Partial<Parameters<typeof CustodyAccount.create>[0]> = {}) {
    return CustodyAccount.create({
        label: 'Custodia YouTube 01',
        identifier: 'custodia1@gmail.com',
        assetType: AssetType.YOUTUBE,
        ...over,
    });
}

function mockCustodyRepo(over: Partial<ICustodyAccountRepository> = {}): ICustodyAccountRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findAll: vi.fn().mockResolvedValue([]),
        findActive: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        ...over,
    };
}

function mockListingRepo(heldBy: unknown[] = []): IListingRepository {
    return {
        findById: vi.fn(),
        findPublished: vi.fn(),
        findBySeller: vi.fn(),
        findByStatus: vi.fn(),
        findHeldBy: vi.fn().mockResolvedValue(heldBy),
        save: vi.fn(),
    } as unknown as IListingRepository;
}

describe('CreateCustodyAccountUseCase', () => {
    it('un BUYER o un SELLER reciben ForbiddenError', async () => {
        const uc = new CreateCustodyAccountUseCase(mockCustodyRepo());
        for (const actor of [BUYER, SELLER]) {
            await expect(
                uc.execute({ label: 'x', identifier: 'x@y.com', assetType: AssetType.YOUTUBE }, actor),
            ).rejects.toThrow(ForbiddenError);
        }
    });

    it('un admin crea la cuenta y la persiste activa', async () => {
        const repo = mockCustodyRepo();
        const uc = new CreateCustodyAccountUseCase(repo);

        const cuenta = await uc.execute(
            { label: 'Custodia YT 1', identifier: 'c1@gmail.com', assetType: AssetType.YOUTUBE },
            ADMIN,
        );

        expect(cuenta.isActive).toBe(true);
        expect(repo.save).toHaveBeenCalledOnce();
    });
});

describe('UpdateCustodyAccountUseCase', () => {
    it('cuenta inexistente → NotFoundError', async () => {
        const uc = new UpdateCustodyAccountUseCase(mockCustodyRepo(), mockListingRepo());
        await expect(uc.execute('nope', { label: 'x' }, ADMIN)).rejects.toThrow(NotFoundError);
    });

    it('cambia el label', async () => {
        const cuenta = unaCuenta();
        const repo = mockCustodyRepo({ findById: vi.fn().mockResolvedValue(cuenta) });
        const uc = new UpdateCustodyAccountUseCase(repo, mockListingRepo());

        await uc.execute(cuenta.id.toString(), { label: 'Nueva etiqueta' }, ADMIN);

        expect(cuenta.label).toBe('Nueva etiqueta');
        expect(repo.save).toHaveBeenCalledOnce();
    });

    it('bloquea el cambio de assetType si la cuenta sostiene activos', async () => {
        const cuenta = unaCuenta();
        const repo = mockCustodyRepo({ findById: vi.fn().mockResolvedValue(cuenta) });
        const listingRepo = mockListingRepo([{}, {}]); // sostiene 2
        const uc = new UpdateCustodyAccountUseCase(repo, listingRepo);

        await expect(
            uc.execute(cuenta.id.toString(), { assetType: AssetType.WEB }, ADMIN),
        ).rejects.toThrow(InvalidStateError);
    });

    it('un no-admin → ForbiddenError', async () => {
        const uc = new UpdateCustodyAccountUseCase(mockCustodyRepo(), mockListingRepo());
        await expect(uc.execute('x', { label: 'y' }, BUYER)).rejects.toThrow(ForbiddenError);
    });
});

describe('DeactivateCustodyAccountUseCase', () => {
    it('consulta findHeldBy y bloquea la baja con activos', async () => {
        const cuenta = unaCuenta();
        const repo = mockCustodyRepo({ findById: vi.fn().mockResolvedValue(cuenta) });
        const listingRepo = mockListingRepo([{}]);
        const uc = new DeactivateCustodyAccountUseCase(repo, listingRepo);

        await expect(uc.execute(cuenta.id.toString(), ADMIN)).rejects.toThrow(InvalidStateError);
        expect(listingRepo.findHeldBy).toHaveBeenCalledWith(cuenta.id.toString());
    });

    it('sin activos, la desactiva', async () => {
        const cuenta = unaCuenta();
        const repo = mockCustodyRepo({ findById: vi.fn().mockResolvedValue(cuenta) });
        const uc = new DeactivateCustodyAccountUseCase(repo, mockListingRepo([]));

        await uc.execute(cuenta.id.toString(), ADMIN);

        expect(cuenta.isActive).toBe(false);
        expect(repo.save).toHaveBeenCalledOnce();
    });

    it('un no-admin → ForbiddenError', async () => {
        const uc = new DeactivateCustodyAccountUseCase(mockCustodyRepo(), mockListingRepo());
        await expect(uc.execute('x', SELLER)).rejects.toThrow(ForbiddenError);
    });
});

describe('ActivateCustodyAccountUseCase', () => {
    it('reactiva una cuenta inactiva', async () => {
        const cuenta = unaCuenta();
        cuenta.deactivate(0);
        const repo = mockCustodyRepo({ findById: vi.fn().mockResolvedValue(cuenta) });
        const uc = new ActivateCustodyAccountUseCase(repo);

        await uc.execute(cuenta.id.toString(), ADMIN);

        expect(cuenta.isActive).toBe(true);
        expect(repo.save).toHaveBeenCalledOnce();
    });
});

describe('ListCustodyAccountsUseCase', () => {
    it('arma heldAssets por cuenta', async () => {
        const c1 = unaCuenta({ identifier: 'c1@gmail.com' });
        const c2 = unaCuenta({ identifier: 'c2@gmail.com' });
        const repo = mockCustodyRepo({ findAll: vi.fn().mockResolvedValue([c1, c2]) });
        const listingRepo = mockListingRepo();
        (listingRepo.findHeldBy as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce([{}, {}, {}])
            .mockResolvedValueOnce([]);
        const uc = new ListCustodyAccountsUseCase(repo, listingRepo);

        const filas = await uc.execute(ADMIN);

        expect(filas).toHaveLength(2);
        expect(filas[0].heldAssets).toBe(3);
        expect(filas[1].heldAssets).toBe(0);
    });

    it('un no-admin → ForbiddenError', async () => {
        const uc = new ListCustodyAccountsUseCase(mockCustodyRepo(), mockListingRepo());
        await expect(uc.execute(BUYER)).rejects.toThrow(ForbiddenError);
    });
});
