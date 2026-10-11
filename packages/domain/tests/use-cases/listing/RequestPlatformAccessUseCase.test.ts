import { describe, it, expect, vi } from 'vitest';
import { RequestPlatformAccessUseCase } from '../../../src/use-cases/listing/RequestPlatformAccessUseCase';
import { IListingRepository } from '../../../src/ports/Repositories';
import { Actor } from '../../../src/ports/Actor';
import { Listing } from '../../../src/entities/Listing';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { ForbiddenError, InvalidStateError, NotFoundError } from '../../../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';
import { PlatformNotifier } from '../../../src/services/PlatformNotifier';
import { INotifier } from '../../../src/ports/INotifier';
import { IUserRepository } from '../../../src/ports/Repositories';
import { Notification } from '../../../src/entities/Notification';
import { User } from '../../../src/entities/User';
import { Email } from '../../../src/value-objects/Email';

const SELLER_ID = new UniqueEntityID();
const SELLER: Actor = { id: SELLER_ID.toString(), role: UserRole.SELLER };
const AJENO: Actor = { id: new UniqueEntityID().toString(), role: UserRole.SELLER };
const ADMIN: Actor = { id: new UniqueEntityID().toString(), role: UserRole.ADMIN };

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

describe('RequestPlatformAccessUseCase', () => {
    it('deja constancia de la solicitud y guarda', async () => {
        const listing = unCanal();
        const repo = repoDe(listing);

        await new RequestPlatformAccessUseCase(repo).execute(listing.id.toString(), SELLER);

        expect(listing.platformAccessRequestedAt).toBeInstanceOf(Date);
        expect(listing.platformAccessStatus()).toBe('verifying');
        expect(repo.save).toHaveBeenCalledOnce();
    });

    it('un segundo pedido conserva la primera fecha', async () => {
        const listing = unCanal();
        const repo = repoDe(listing);
        const useCase = new RequestPlatformAccessUseCase(repo);

        await useCase.execute(listing.id.toString(), SELLER);
        const primera = listing.platformAccessRequestedAt;
        await useCase.execute(listing.id.toString(), SELLER);

        expect(listing.platformAccessRequestedAt).toBe(primera);
    });

    it('404 si el activo no existe', async () => {
        await expect(
            new RequestPlatformAccessUseCase(repoDe(null)).execute('x', SELLER),
        ).rejects.toThrow(NotFoundError);
    });

    it('rechaza a quien no es el vendedor, admin incluido, y no guarda', async () => {
        const listing = unCanal();
        const repo = repoDe(listing);
        const useCase = new RequestPlatformAccessUseCase(repo);

        await expect(useCase.execute(listing.id.toString(), AJENO)).rejects.toThrow(ForbiddenError);
        await expect(useCase.execute(listing.id.toString(), ADMIN)).rejects.toThrow(ForbiddenError);
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('rechaza un activo vendido', async () => {
        const listing = Listing.reconstitute(
            { ...unCanal().toSnapshot().props, status: 'sold' },
            new UniqueEntityID(),
            new Date(),
        );
        const repo = repoDe(listing);

        await expect(
            new RequestPlatformAccessUseCase(repo).execute(listing.id.toString(), SELLER),
        ).rejects.toThrow(InvalidStateError);
        expect(repo.save).not.toHaveBeenCalled();
    });

    describe('aviso a la plataforma', () => {
        function armarConAvisos(listing: Listing) {
            const enviadas: Notification[] = [];
            const notifier: INotifier = {
                notify: vi.fn().mockImplementation(async (n: Notification[]) => {
                    enviadas.push(...n);
                }),
            };
            const admin = User.create({
                email: Email.create('admin@traspaso.com'),
                fullName: 'Admin',
                role: UserRole.ADMIN,
                passwordHash: 'x',
            });
            const userRepo: IUserRepository = {
                findById: vi.fn(),
                findByEmail: vi.fn(),
                findByRole: vi.fn().mockResolvedValue([admin]),
                save: vi.fn(),
            };
            const repo = repoDe(listing);
            const useCase = new RequestPlatformAccessUseCase(repo, new PlatformNotifier(notifier, userRepo));
            return { useCase, enviadas };
        }

        it('avisa a los administradores la primera vez', async () => {
            const listing = unCanal();
            const { useCase, enviadas } = armarConAvisos(listing);

            await useCase.execute(listing.id.toString(), SELLER);

            expect(enviadas).toHaveLength(1);
            expect(enviadas[0].type).toBe('acceso_solicitado');
        });

        it('no vuelve a avisar si el vendedor repite el pedido', async () => {
            const listing = unCanal();
            const { useCase, enviadas } = armarConAvisos(listing);

            await useCase.execute(listing.id.toString(), SELLER);
            await useCase.execute(listing.id.toString(), SELLER);

            expect(enviadas).toHaveLength(1);
        });
    });
});
