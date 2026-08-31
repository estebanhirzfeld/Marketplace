import { describe, it, expect, vi } from 'vitest';
import { CreateOfferUseCase } from '../../src/use-cases/negotiation/CreateOfferUseCase';
import { CreateListingUseCase } from '../../src/use-cases/listing/CreateListingUseCase';
import { GetListingDetailsUseCase } from '../../src/use-cases/listing/GetListingDetailsUseCase';
import {
    IContractRepository,
    IListingRepository,
    IOperationRepository,
    IUserRepository,
} from '../../src/ports/Repositories';
import { Actor } from '../../src/ports/Actor';
import { Listing } from '../../src/entities/Listing';
import { User } from '../../src/entities/User';
import { Money } from '../../src/value-objects/Money';
import { Email } from '../../src/value-objects/Email';
import { UniqueEntityID } from '../../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../../src/strategies/YouTubeStrategy';
import { ForbiddenError } from '../../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

/**
 * El admin es operador puro: atestigua la custodia y el acceso al activo, que
 * son las dos constancias sobre las que se apoya todo el escrow. Si además
 * pudiera comprar o vender quedaría de los dos lados de una operación que él
 * mismo verifica, que es justamente el arreglo que la plataforma existe para
 * volver innecesario entre desconocidos.
 *
 * La contrapartida es que ve los datos reservados sin firmar nada: un operador
 * que no sabe de qué canal se trata no puede comprobar la titularidad ni
 * confirmar que la plataforma tiene la cuenta.
 */

const SELLER_ID = new UniqueEntityID();
const ADMIN: Actor = { id: new UniqueEntityID().toString(), role: UserRole.ADMIN };
const BUYER: Actor = { id: new UniqueEntityID().toString(), role: UserRole.BUYER };
const SELLER: Actor = { id: SELLER_ID.toString(), role: UserRole.SELLER };

function unCanalPublicado(): Listing {
    const listing = Listing.reconstitute(
        {
            sellerId: SELLER_ID,
            assetStrategy: new YouTubeStrategy({
                monthlyRevenueUsd: Money.fromCents(120000, 'USD'),
                subscribers: 55000,
                isMonetized: true,
                channelUrl: 'https://youtube.com/@canaldeprueba',
            }),
            askingPrice: Money.fromCents(3600000, 'USD'),
            status: 'published',
            publishedAt: new Date(),
        },
        new UniqueEntityID(),
        new Date(),
    );
    return listing;
}

function listingRepoCon(listing: Listing | null): IListingRepository {
    return {
        findById: vi.fn().mockResolvedValue(listing),
        findPublished: vi.fn().mockResolvedValue([]),
        findBySeller: vi.fn().mockResolvedValue([]),
        findByStatus: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function operationRepoVacio(): IOperationRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findByListing: vi.fn().mockResolvedValue([]),
        findByParty: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function contractRepoVacio(): IContractRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findByOperation: vi.fn().mockResolvedValue([]),
        findByListingAndSigner: vi.fn().mockResolvedValue(null),
        findAllByListing: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function userRepoCon(user: User): IUserRepository {
    return {
        findById: vi.fn().mockResolvedValue(user),
        findByEmail: vi.fn().mockResolvedValue(user),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

const unUsuario = (role: UserRole) =>
    User.create({
        email: Email.create('alguien@traspaso.com'),
        fullName: 'Alguien',
        dni: '20111222333',
        role,
        country: 'AR',
        passwordHash: 'hash',
    });

const UN_ACTIVO = {
    assetType: 'web',
    assetData: {
        monthlyRevenueUsdCents: 50000,
        currency: 'USD',
        domainAuthority: 30,
        domain: 'ejemplo.com',
    },
    askingPrice: { cents: 1500000, currency: 'USD' },
};

// ═════════════════════════════════════════════════════════

describe('El admin no puede comprar', () => {
    function armar(listing: Listing) {
        const operationRepo = operationRepoVacio();
        const uso = new CreateOfferUseCase(operationRepo, listingRepoCon(listing));
        return { uso, operationRepo };
    }

    it('rechaza la oferta de un admin', async () => {
        const { uso, operationRepo } = armar(unCanalPublicado());

        await expect(
            uso.execute({ listingId: 'l1', offerPrice: { cents: 100000, currency: 'USD' } }, ADMIN),
        ).rejects.toThrow(ForbiddenError);

        // Y no deja rastro: la operación no llega a guardarse.
        expect(operationRepo.save).not.toHaveBeenCalled();
    });

    it('explica por qué, en vez de decir solo que no', async () => {
        const { uso } = armar(unCanalPublicado());

        await expect(
            uso.execute({ listingId: 'l1', offerPrice: { cents: 100000, currency: 'USD' } }, ADMIN),
        ).rejects.toThrow(/custodia|verifica|operador/i);
    });

    it('sigue dejando ofertar a un comprador cualquiera', async () => {
        const { uso, operationRepo } = armar(unCanalPublicado());

        await uso.execute(
            { listingId: 'l1', offerPrice: { cents: 100000, currency: 'USD' } },
            BUYER,
        );

        expect(operationRepo.save).toHaveBeenCalledOnce();
    });
});

describe('El admin no puede vender', () => {
    it('rechaza la publicación de un admin', async () => {
        const listingRepo = listingRepoCon(null);
        const uso = new CreateListingUseCase(listingRepo, userRepoCon(unUsuario(UserRole.ADMIN)));

        await expect(uso.execute(UN_ACTIVO, ADMIN)).rejects.toThrow(ForbiddenError);
        expect(listingRepo.save).not.toHaveBeenCalled();
    });

    it('sigue dejando publicar a un vendedor', async () => {
        const listingRepo = listingRepoCon(null);
        const uso = new CreateListingUseCase(listingRepo, userRepoCon(unUsuario(UserRole.SELLER)));

        await uso.execute(UN_ACTIVO, SELLER);

        expect(listingRepo.save).toHaveBeenCalledOnce();
    });
});

describe('El admin ve los datos reservados sin firmar NDA', () => {
    function armar(listing: Listing) {
        return new GetListingDetailsUseCase(listingRepoCon(listing), contractRepoVacio());
    }

    /**
     * El blindaje protege al vendedor de que le copien el activo sin comprarlo.
     * La plataforma no es ese tercero: es la custodia.
     */
    it('le muestra la dirección del canal al admin', async () => {
        const vista = await armar(unCanalPublicado()).execute('l1', ADMIN);

        expect(vista.assetData.channelUrl).toBe('https://youtube.com/@canaldeprueba');
        expect(vista.hiddenFields).toEqual([]);
    });

    it('se la sigue ocultando a un comprador sin NDA', async () => {
        const vista = await armar(unCanalPublicado()).execute('l1', BUYER);

        expect(vista.assetData.channelUrl).toBeUndefined();
        expect(vista.hiddenFields).toContain('channelUrl');
    });

    it('se la sigue ocultando a un visitante anónimo', async () => {
        const vista = await armar(unCanalPublicado()).execute('l1');

        expect(vista.assetData.channelUrl).toBeUndefined();
        expect(vista.hiddenFields).toContain('channelUrl');
    });

    it('el vendedor sigue viendo su propio activo entero', async () => {
        const vista = await armar(unCanalPublicado()).execute('l1', SELLER);

        expect(vista.assetData.channelUrl).toBe('https://youtube.com/@canaldeprueba');
    });
});
