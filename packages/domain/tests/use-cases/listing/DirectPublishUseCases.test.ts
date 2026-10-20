import { describe, it, expect, vi } from 'vitest';
import { PublishListingUseCase } from '../../../src/use-cases/listing/PublishListingUseCase';
import { EditListingUseCase } from '../../../src/use-cases/listing/EditListingUseCase';
import { DeleteDraftListingUseCase } from '../../../src/use-cases/listing/DeleteDraftListingUseCase';
import {
    IListingDeleter,
    IListingRepository,
    ISellerPaymentAccountRepository,
    IUserRepository,
} from '../../../src/ports/Repositories';
import { Actor } from '../../../src/ports/Actor';
import { Listing } from '../../../src/entities/Listing';
import { User } from '../../../src/entities/User';
import { Email } from '../../../src/value-objects/Email';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { ForbiddenError, InvalidStateError, NotFoundError } from '../../../src/errors/DomainError';
import { AssetNiche, UserRole } from '@marketplace/shared-types';

const SELLER_ID = new UniqueEntityID();
const SELLER: Actor = { id: SELLER_ID.toString(), role: UserRole.SELLER };
const AJENO: Actor = { id: new UniqueEntityID().toString(), role: UserRole.SELLER };

function unCanal(conTitularidad = true): Listing {
    const listing = Listing.create({
        sellerId: SELLER_ID,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(120000, 'USD'),
            subscribers: 55000,
            isMonetized: true,
        }),
        askingPrice: Money.fromCents(1_500_000, 'USD'),
    });
    if (conTitularidad) {
        listing.registerOwnershipVerification({
            verifiedBy: SELLER_ID,
            assetId: 'UCq-Fj5jknLsUf-MWSy4_brA',
            source: 'youtube',
        });
    }
    return listing;
}

function usuario(conKyc: boolean): User {
    const user = User.create({
        email: Email.create('vendedor@test.com'),
        fullName: 'Vendedor',
        dni: '20123456789',
        role: UserRole.SELLER,
        passwordHash: 'hash',
    });
    if (conKyc) user.verifyKyc();
    return user;
}

function repoDe(listing: Listing | null): IListingRepository & IListingDeleter {
    return {
        findById: vi.fn().mockResolvedValue(listing),
        findPublished: vi.fn().mockResolvedValue([]),
        findBySeller: vi.fn().mockResolvedValue([]),
        findByStatus: vi.fn().mockResolvedValue([]),
        findHeldBy: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
    };
}

function usersDe(user: User | null): IUserRepository {
    return {
        findById: vi.fn().mockResolvedValue(user),
        findByEmail: vi.fn().mockResolvedValue(null),
        findByRole: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function cuentasDe(vinculada: boolean): ISellerPaymentAccountRepository {
    return {
        findByUserId: vi.fn().mockResolvedValue(null),
        existsByUserId: vi.fn().mockResolvedValue(vinculada),
        findByMpUserId: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockResolvedValue(undefined),
        deleteByUserId: vi.fn().mockResolvedValue(undefined),
    };
}

describe('PublishListingUseCase', () => {
    it('publica directo un canal con la titularidad comprobada', async () => {
        const listing = unCanal();
        const repo = repoDe(listing);

        await new PublishListingUseCase(repo, usersDe(usuario(true))).execute(
            listing.id.toString(),
            SELLER,
        );

        expect(listing.status).toBe('published');
        expect(repo.save).toHaveBeenCalledOnce();
    });

    it('no existe', async () => {
        await expect(
            new PublishListingUseCase(repoDe(null), usersDe(usuario(true))).execute('x', SELLER),
        ).rejects.toThrow(NotFoundError);
    });

    it('solo el dueño publica', async () => {
        const listing = unCanal();
        const repo = repoDe(listing);

        await expect(
            new PublishListingUseCase(repo, usersDe(usuario(true))).execute(listing.id.toString(), AJENO),
        ).rejects.toThrow(ForbiddenError);
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('exige KYC', async () => {
        const listing = unCanal();
        const repo = repoDe(listing);

        await expect(
            new PublishListingUseCase(repo, usersDe(usuario(false))).execute(listing.id.toString(), SELLER),
        ).rejects.toThrow();
        expect(listing.status).toBe('draft');
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('exige Mercado Pago vinculado cuando la exigencia está encendida', async () => {
        const listing = unCanal();
        const repo = repoDe(listing);

        await expect(
            new PublishListingUseCase(repo, usersDe(usuario(true)), cuentasDe(false)).execute(
                listing.id.toString(),
                SELLER,
            ),
        ).rejects.toThrow(/Mercado Pago/);
        expect(repo.save).not.toHaveBeenCalled();

        await new PublishListingUseCase(repo, usersDe(usuario(true)), cuentasDe(true)).execute(
            listing.id.toString(),
            SELLER,
        );
        expect(listing.status).toBe('published');
    });

    it('sin titularidad comprobada no publica: va por revisión', async () => {
        const listing = unCanal(false);
        const repo = repoDe(listing);

        await expect(
            new PublishListingUseCase(repo, usersDe(usuario(true))).execute(listing.id.toString(), SELLER),
        ).rejects.toThrow(InvalidStateError);
        expect(repo.save).not.toHaveBeenCalled();
    });
});

describe('EditListingUseCase', () => {
    it('edita los campos del vendedor y el precio de un borrador', async () => {
        const listing = unCanal();
        const repo = repoDe(listing);

        await new EditListingUseCase(repo).execute(
            listing.id.toString(),
            {
                niche: AssetNiche.GAMING,
                hasNoFaceContent: true,
                askingPrice: { cents: 2_000_000, currency: 'ARS' },
            },
            SELLER,
        );

        expect(listing.assetDataFor(true).assetData.niche).toBe(AssetNiche.GAMING);
        expect(listing.askingPrice.getCents()).toBe(2_000_000);
        expect(listing.askingPrice.getCurrency()).toBe('ARS');
        expect(repo.save).toHaveBeenCalledOnce();
    });

    it('un publicado solo admite cambiar el precio', async () => {
        const listing = unCanal();
        listing.publish();
        const repo = repoDe(listing);

        await new EditListingUseCase(repo).execute(
            listing.id.toString(),
            { askingPrice: { cents: 1_000_000, currency: 'USD' } },
            SELLER,
        );
        expect(listing.askingPrice.getCents()).toBe(1_000_000);

        await expect(
            new EditListingUseCase(repo).execute(
                listing.id.toString(),
                { niche: AssetNiche.GAMING },
                SELLER,
            ),
        ).rejects.toThrow(InvalidStateError);
    });

    it('solo el dueño edita', async () => {
        const listing = unCanal();
        const repo = repoDe(listing);

        await expect(
            new EditListingUseCase(repo).execute(
                listing.id.toString(),
                { niche: AssetNiche.GAMING },
                AJENO,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('no existe', async () => {
        await expect(
            new EditListingUseCase(repoDe(null)).execute('x', { niche: AssetNiche.GAMING }, SELLER),
        ).rejects.toThrow(NotFoundError);
    });
});

describe('DeleteDraftListingUseCase', () => {
    it('borra el borrador del dueño', async () => {
        const listing = unCanal();
        const repo = repoDe(listing);

        await new DeleteDraftListingUseCase(repo).execute(listing.id.toString(), SELLER);

        expect(repo.delete).toHaveBeenCalledWith(listing.id.toString());
    });

    it('solo el dueño borra', async () => {
        const listing = unCanal();
        const repo = repoDe(listing);

        await expect(
            new DeleteDraftListingUseCase(repo).execute(listing.id.toString(), AJENO),
        ).rejects.toThrow(ForbiddenError);
        expect(repo.delete).not.toHaveBeenCalled();
    });

    it('no borra un activo publicado', async () => {
        const listing = unCanal();
        listing.publish();
        const repo = repoDe(listing);

        await expect(
            new DeleteDraftListingUseCase(repo).execute(listing.id.toString(), SELLER),
        ).rejects.toThrow(InvalidStateError);
        expect(repo.delete).not.toHaveBeenCalled();
    });

    it('no existe', async () => {
        await expect(
            new DeleteDraftListingUseCase(repoDe(null)).execute('x', SELLER),
        ).rejects.toThrow(NotFoundError);
    });
});
