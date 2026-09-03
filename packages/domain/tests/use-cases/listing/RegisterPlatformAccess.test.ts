import { describe, it, expect, vi } from 'vitest';
import { RegisterPlatformAccessUseCase } from '../../../src/use-cases/listing/RegisterPlatformAccessUseCase';
import { Listing } from '../../../src/entities/Listing';
import { CustodyAccount } from '../../../src/entities/CustodyAccount';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { Actor } from '../../../src/ports/Actor';
import {
    IListingRepository,
    ICustodyAccountRepository,
} from '../../../src/ports/Repositories';
import {
    ForbiddenError,
    InvalidStateError,
    NotFoundError,
} from '../../../src/errors/DomainError';
import { AssetType, UserRole } from '@marketplace/shared-types';

const ADMIN: Actor = { id: 'admin-1', role: UserRole.ADMIN };
const AYER = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

function unCanal(): Listing {
    return Listing.create({
        sellerId: new UniqueEntityID(),
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(50000, 'USD'),
            subscribers: 10000,
            isMonetized: true,
        }),
        askingPrice: Money.fromCents(1_000_000, 'USD'),
    });
}

function cuentaYouTube() {
    return CustodyAccount.create({
        label: 'Custodia YT',
        identifier: 'custodia-yt@traspaso.com',
        assetType: AssetType.YOUTUBE,
    });
}

function mocks(listing: Listing | null, account: CustodyAccount | null) {
    const listingRepo: IListingRepository = {
        findById: vi.fn().mockResolvedValue(listing),
        findPublished: vi.fn(),
        findBySeller: vi.fn(),
        findByStatus: vi.fn(),
        findHeldBy: vi.fn(),
        save: vi.fn().mockResolvedValue(undefined),
    } as unknown as IListingRepository;
    const custodyRepo: ICustodyAccountRepository = {
        findById: vi.fn().mockResolvedValue(account),
        findAll: vi.fn(),
        findActive: vi.fn(),
        save: vi.fn(),
    };
    return { listingRepo, custodyRepo };
}

describe('RegisterPlatformAccessUseCase con cuenta de custodia', () => {
    it('camino feliz: la constancia queda con el custodyAccountId de la cuenta', async () => {
        const listing = unCanal();
        const account = cuentaYouTube();
        const { listingRepo, custodyRepo } = mocks(listing, account);

        await new RegisterPlatformAccessUseCase(listingRepo, custodyRepo).execute(
            listing.id.toString(),
            { accessSince: AYER, custodyAccountId: account.id.toString() },
            ADMIN,
        );

        expect(listing.platformAccess?.custodyAccountId?.toString()).toBe(account.id.toString());
        expect(listingRepo.save).toHaveBeenCalledOnce();
    });

    it('cuenta inexistente → NotFoundError', async () => {
        const listing = unCanal();
        const { listingRepo, custodyRepo } = mocks(listing, null);

        await expect(
            new RegisterPlatformAccessUseCase(listingRepo, custodyRepo).execute(
                listing.id.toString(),
                { accessSince: AYER, custodyAccountId: 'nope' },
                ADMIN,
            ),
        ).rejects.toThrow(NotFoundError);
    });

    it('cuenta inactiva → error de estado', async () => {
        const listing = unCanal();
        const account = cuentaYouTube();
        account.deactivate(0);
        const { listingRepo, custodyRepo } = mocks(listing, account);

        await expect(
            new RegisterPlatformAccessUseCase(listingRepo, custodyRepo).execute(
                listing.id.toString(),
                { accessSince: AYER, custodyAccountId: account.id.toString() },
                ADMIN,
            ),
        ).rejects.toThrow(InvalidStateError);
    });

    it('assetType incompatible → error de estado', async () => {
        const listing = unCanal();
        const account = CustodyAccount.create({
            label: 'Custodia Web',
            identifier: 'registrador@traspaso.com',
            assetType: AssetType.WEB,
        });
        const { listingRepo, custodyRepo } = mocks(listing, account);

        await expect(
            new RegisterPlatformAccessUseCase(listingRepo, custodyRepo).execute(
                listing.id.toString(),
                { accessSince: AYER, custodyAccountId: account.id.toString() },
                ADMIN,
            ),
        ).rejects.toThrow(InvalidStateError);
    });

    it('un no-admin → ForbiddenError', async () => {
        const { listingRepo, custodyRepo } = mocks(unCanal(), cuentaYouTube());
        await expect(
            new RegisterPlatformAccessUseCase(listingRepo, custodyRepo).execute(
                'x',
                { accessSince: AYER, custodyAccountId: 'y' },
                { id: 'seller-1', role: UserRole.SELLER },
            ),
        ).rejects.toThrow(ForbiddenError);
    });
});
