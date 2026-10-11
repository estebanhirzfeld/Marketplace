import { describe, it, expect, vi } from 'vitest';
import { RejectPlatformAccessRequestUseCase } from '../../../src/use-cases/listing/RejectPlatformAccessRequestUseCase';
import { NegotiationNotifier } from '../../../src/services/NegotiationNotifier';
import { INotifier, } from '../../../src/ports/INotifier';
import { IListingRepository } from '../../../src/ports/Repositories';
import { Actor } from '../../../src/ports/Actor';
import { Listing } from '../../../src/entities/Listing';
import { Notification } from '../../../src/entities/Notification';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { ForbiddenError, InvalidStateError, NotFoundError } from '../../../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

const SELLER_ID = new UniqueEntityID();
const ADMIN: Actor = { id: new UniqueEntityID().toString(), role: UserRole.ADMIN };
const SELLER: Actor = { id: SELLER_ID.toString(), role: UserRole.SELLER };

function unCanal(): Listing {
    return Listing.create({
        sellerId: SELLER_ID,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(120000, 'USD'),
            subscribers: 55000,
            isMonetized: true,
        }),
        askingPrice: Money.fromCents(1_500_000, 'USD'),
    });
}

function repoDe(listing: Listing | null): IListingRepository {
    return {
        findById: vi.fn().mockResolvedValue(listing),
        findPublished: vi.fn().mockResolvedValue([]),
        findBySeller: vi.fn().mockResolvedValue([]),
        findByStatus: vi.fn().mockResolvedValue([]),
        findHeldBy: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function armar(listing: Listing | null) {
    const sent: Notification[] = [];
    const notifier: INotifier = {
        notify: vi.fn().mockImplementation(async (n: Notification[]) => {
            sent.push(...n);
        }),
    };
    const repo = repoDe(listing);
    const useCase = new RejectPlatformAccessRequestUseCase(repo, new NegotiationNotifier(notifier));
    return { repo, sent, useCase };
}

describe('RejectPlatformAccessRequestUseCase', () => {
    it('devuelve el activo a pending, guarda y avisa al vendedor', async () => {
        const listing = unCanal();
        listing.requestPlatformAccess(new Date());
        const { repo, sent, useCase } = armar(listing);

        await useCase.execute(listing.id.toString(), ADMIN);

        expect(listing.platformAccessStatus()).toBe('pending');
        expect(repo.save).toHaveBeenCalledOnce();
        expect(sent).toHaveLength(1);
        expect(sent[0].type).toBe('acceso_no_encontrado');
        expect(sent[0].userId.toString()).toBe(SELLER.id);
    });

    it('solo un admin puede rechazar', async () => {
        const listing = unCanal();
        listing.requestPlatformAccess(new Date());
        const { repo, useCase } = armar(listing);

        await expect(useCase.execute(listing.id.toString(), SELLER)).rejects.toThrow(ForbiddenError);
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('404 si el activo no existe', async () => {
        await expect(armar(null).useCase.execute('x', ADMIN)).rejects.toThrow(NotFoundError);
    });

    it('409 si el vendedor no pidió la verificación, sin guardar ni avisar', async () => {
        const { repo, sent, useCase } = armar(unCanal());

        await expect(useCase.execute('x', ADMIN)).rejects.toThrow(InvalidStateError);
        expect(repo.save).not.toHaveBeenCalled();
        expect(sent).toHaveLength(0);
    });
});
