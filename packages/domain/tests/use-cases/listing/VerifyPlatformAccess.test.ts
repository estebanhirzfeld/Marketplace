import { describe, it, expect, vi } from 'vitest';
import {
    ListListingsAwaitingAccessUseCase,
    StartPlatformAccessVerificationUseCase,
    VerifyPlatformAccessUseCase,
} from '../../../src/use-cases/listing/VerifyPlatformAccessUseCases';
import { RegisterPlatformAccessUseCase } from '../../../src/use-cases/listing/RegisterPlatformAccessUseCase';
import { Listing, ListingStatus } from '../../../src/entities/Listing';
import { CustodyAccount } from '../../../src/entities/CustodyAccount';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../../../src/strategies/WebStrategy';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { Actor } from '../../../src/ports/Actor';
import { ICustodyAccountRepository, IListingRepository } from '../../../src/ports/Repositories';
import {
    GoogleAuthorizer,
    IYouTubeCustodyAccessReader,
    OwnedYouTubeChannel,
} from '../../../src/ports/IOwnershipReaders';
import { IYouTubeChannelReader } from '../../../src/ports/IYouTubeChannelReader';
import { ForbiddenError, InvalidStateError, NotFoundError } from '../../../src/errors/DomainError';
import { AssetType, UserRole } from '@marketplace/shared-types';

const ADMIN: Actor = { id: 'admin-1', role: UserRole.ADMIN };
const SELLER: Actor = { id: 'seller-1', role: UserRole.SELLER };
const CANAL_ID = 'UCq-Fj5jknLsUf-MWSy4_brA';
const OTRO_ID = 'UC00000000000000000000aa';
const GRANT = 'codigo-de-google';

function canal(channelUrl = `https://www.youtube.com/channel/${CANAL_ID}`): Listing {
    return Listing.create({
        sellerId: new UniqueEntityID(),
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(50000, 'USD'),
            subscribers: 10000,
            isMonetized: true,
            channelUrl,
        }),
        askingPrice: Money.fromCents(1_000_000, 'USD'),
    });
}

function conSolicitud(listing: Listing): Listing {
    listing.requestPlatformAccess(new Date());
    return listing;
}

function cuenta(): CustodyAccount {
    return CustodyAccount.create({
        label: 'Custodia YT',
        identifier: 'custodia-yt@traspaso.com',
        assetType: AssetType.YOUTUBE,
    });
}

function listingRepo(listing: Listing | null, byStatus: Partial<Record<ListingStatus, Listing[]>> = {}) {
    const repo: IListingRepository = {
        findById: vi.fn().mockResolvedValue(listing),
        findPublished: vi.fn(),
        findBySeller: vi.fn(),
        findByStatus: vi.fn().mockImplementation(async (s: ListingStatus) => byStatus[s] ?? []),
        findHeldBy: vi.fn(),
        save: vi.fn().mockResolvedValue(undefined),
    };
    return repo;
}

function custodyRepo(accounts: CustodyAccount[]) {
    const repo: ICustodyAccountRepository = {
        findById: vi.fn().mockImplementation(async (id: string) => accounts.find((a) => a.id.toString() === id) ?? null),
        findAll: vi.fn(),
        findActive: vi.fn().mockResolvedValue(accounts.filter((a) => a.isActive)),
        save: vi.fn(),
    };
    return repo;
}

const AUTORIZADOR: GoogleAuthorizer = { email: 'custodia-yt@traspaso.com', emailVerified: true, subject: 'sub-123' };

function ownershipReader(
    channelIds: string[],
    authorizer: GoogleAuthorizer | null = AUTORIZADOR,
    titles: Record<string, string> = {},
): IYouTubeCustodyAccessReader {
    const channels: OwnedYouTubeChannel[] = channelIds.map((channelId) => ({
        channelId,
        title: titles[channelId] ?? 'Canal',
    }));
    return { authorizedChannelsOf: vi.fn().mockResolvedValue({ authorizer, channels }) };
}

function channelReader(channelId: string | null): IYouTubeChannelReader {
    return {
        read: vi.fn().mockResolvedValue(
            channelId === null ? null : { channelId, title: 'Canal', views: 1, publicVideos: 1, readAt: new Date() },
        ),
    };
}

function armar(
    listing: Listing | null,
    accounts: CustodyAccount[],
    owned: string[],
    resolved: string | null = CANAL_ID,
    authorizer: GoogleAuthorizer | null = AUTORIZADOR,
    titles: Record<string, string> = {},
) {
    const listings = listingRepo(listing);
    const custody = custodyRepo(accounts);
    const reader = ownershipReader(owned, authorizer, titles);
    const channels = channelReader(resolved);
    const register = new RegisterPlatformAccessUseCase(listings, custody);
    const useCase = new VerifyPlatformAccessUseCase(listings, custody, reader, channels, register);
    return { listings, custody, reader, channels, useCase };
}

describe('VerifyPlatformAccessUseCase', () => {
    it('si la cuenta elegida administra el canal, registra el acceso con la cuenta de custodia', async () => {
        const listing = conSolicitud(canal());
        const account = cuenta();
        const { useCase, listings, reader } = armar(listing, [account], [CANAL_ID]);

        await useCase.execute(listing.id.toString(), GRANT, ADMIN);

        expect(reader.authorizedChannelsOf).toHaveBeenCalledWith(GRANT);
        expect(listing.platformAccess?.custodyAccountId?.toString()).toBe(account.id.toString());
        expect(listing.platformAccess?.verifiedBy.toString()).toBe(ADMIN.id);
        expect(listing.platformAccess?.heldRole).toBe('manager');
        expect(listing.platformAccess?.notes).toBe(
            'Verificado por OAuth de la cuenta de custodia custodia-yt@traspaso.com (sub sub-123)',
        );
        expect(listing.platformAccessStatus()).not.toBe('verifying');
        expect(listings.save).toHaveBeenCalledOnce();
    });

    it('compara el correo sin distinguir mayúsculas ni espacios', async () => {
        const listing = conSolicitud(canal());
        const { useCase } = armar(listing, [cuenta()], [CANAL_ID], CANAL_ID, {
            ...AUTORIZADOR,
            email: '  Custodia-YT@Traspaso.com ',
        });

        await useCase.execute(listing.id.toString(), GRANT, ADMIN);

        expect(listing.platformAccess).toBeDefined();
    });

    it('si ingresó con otra cuenta de Google, rechaza aunque administre el canal y no registra nada', async () => {
        const listing = conSolicitud(canal());
        const { useCase, listings } = armar(listing, [cuenta()], [CANAL_ID], CANAL_ID, {
            ...AUTORIZADOR,
            email: 'otra@gmail.com',
        });

        await expect(useCase.execute(listing.id.toString(), GRANT, ADMIN)).rejects.toThrow(
            'Ingresaste con otra cuenta de Google. Usá la cuenta de custodia (custodia-yt@traspaso.com).',
        );
        await expect(useCase.execute(listing.id.toString(), GRANT, ADMIN)).rejects.toThrow(ForbiddenError);
        expect(listing.platformAccess).toBeUndefined();
        expect(listings.save).not.toHaveBeenCalled();
    });

    it('si el correo no está verificado, rechaza como otra cuenta', async () => {
        const listing = conSolicitud(canal());
        const { useCase, listings } = armar(listing, [cuenta()], [CANAL_ID], CANAL_ID, {
            ...AUTORIZADOR,
            emailVerified: false,
        });

        await expect(useCase.execute(listing.id.toString(), GRANT, ADMIN)).rejects.toThrow(ForbiddenError);
        expect(listings.save).not.toHaveBeenCalled();
    });

    it('si Google no informa quién inició sesión, rechaza y no registra nada', async () => {
        const listing = conSolicitud(canal());
        const { useCase, listings } = armar(listing, [cuenta()], [CANAL_ID], CANAL_ID, null);

        await expect(useCase.execute(listing.id.toString(), GRANT, ADMIN)).rejects.toThrow(
            'Google no informó quién inició sesión; volvé a intentarlo.',
        );
        await expect(useCase.execute(listing.id.toString(), GRANT, ADMIN)).rejects.toThrow(ForbiddenError);
        expect(listings.save).not.toHaveBeenCalled();
    });

    it('con varios canales devueltos alcanza con que uno sea el publicado', async () => {
        const listing = conSolicitud(canal());
        const { useCase } = armar(listing, [cuenta()], [OTRO_ID, CANAL_ID]);

        await useCase.execute(listing.id.toString(), GRANT, ADMIN);

        expect(listing.platformAccess).toBeDefined();
    });

    it('si el canal publicado es un handle, lo resuelve a su ID antes de comparar', async () => {
        const listing = conSolicitud(canal('https://youtube.com/@canaldeprueba'));
        const { useCase, channels } = armar(listing, [cuenta()], [CANAL_ID]);

        await useCase.execute(listing.id.toString(), GRANT, ADMIN);

        expect(channels.read).toHaveBeenCalledOnce();
        expect(listing.platformAccess).toBeDefined();
    });

    it('si la cuenta elegida no administra el canal, rechaza y no registra nada', async () => {
        const listing = conSolicitud(canal());
        const { useCase, listings } = armar(listing, [cuenta()], [OTRO_ID]);

        await expect(useCase.execute(listing.id.toString(), GRANT, ADMIN)).rejects.toThrow(
            'Elegiste «Canal» y el activo es «Canal»',
        );
        await expect(useCase.execute(listing.id.toString(), GRANT, ADMIN)).rejects.toThrow(ForbiddenError);
        expect(listing.platformAccess).toBeUndefined();
        expect(listings.save).not.toHaveBeenCalled();
    });

    it('el rechazo nombra el canal elegido y el del activo, y explica cómo volver a elegir', async () => {
        const listing = conSolicitud(canal());
        const { useCase } = armar(listing, [cuenta()], [OTRO_ID], CANAL_ID, AUTORIZADOR, { [OTRO_ID]: 'Forza Labs' });

        const error = await useCase.execute(listing.id.toString(), GRANT, ADMIN).catch((e: Error) => e);

        expect(error).toBeInstanceOf(ForbiddenError);
        expect((error as Error).message).toBe(
            'Elegiste «Forza Labs» y el activo es «Canal». Volvé a intentar y elegí ese canal. ' +
                'Si Google no te deja elegir, quitá el acceso de Traspaso en myaccount.google.com/connections y probá de nuevo.',
        );
        expect((error as Error).message).not.toContain('Cuenta de Marca');
    });

    it('si la cuenta no administra ningún canal, el rechazo dice «una cuenta sin canal»', async () => {
        const listing = conSolicitud(canal());
        const { useCase } = armar(listing, [cuenta()], []);

        await expect(useCase.execute(listing.id.toString(), GRANT, ADMIN)).rejects.toThrow('Elegiste «una cuenta sin canal»');
    });

    it('si la cuenta no administra ningún canal, también rechaza', async () => {
        const listing = conSolicitud(canal());
        const { useCase } = armar(listing, [cuenta()], []);

        await expect(useCase.execute(listing.id.toString(), GRANT, ADMIN)).rejects.toThrow(ForbiddenError);
    });

    it('exige un admin y no consulta a Google si no lo es', async () => {
        const listing = conSolicitud(canal());
        const { useCase, reader } = armar(listing, [cuenta()], [CANAL_ID]);

        await expect(useCase.execute(listing.id.toString(), GRANT, SELLER)).rejects.toThrow(ForbiddenError);
        expect(reader.authorizedChannelsOf).not.toHaveBeenCalled();
    });

    it('sin solicitud del vendedor no hay nada que verificar', async () => {
        const listing = canal();
        const { useCase, reader } = armar(listing, [cuenta()], [CANAL_ID]);

        await expect(useCase.execute(listing.id.toString(), GRANT, ADMIN)).rejects.toThrow(InvalidStateError);
        expect(reader.authorizedChannelsOf).not.toHaveBeenCalled();
    });

    it('si el acceso ya está registrado, no lo registra de nuevo', async () => {
        const listing = conSolicitud(canal());
        const account = cuenta();
        const { useCase, listings } = armar(listing, [account], [CANAL_ID]);
        await useCase.execute(listing.id.toString(), GRANT, ADMIN);
        vi.mocked(listings.save).mockClear();

        await expect(useCase.execute(listing.id.toString(), GRANT, ADMIN)).rejects.toThrow(InvalidStateError);
        expect(listings.save).not.toHaveBeenCalled();
    });

    it('un activo inexistente es NotFoundError', async () => {
        const { useCase } = armar(null, [cuenta()], [CANAL_ID]);

        await expect(useCase.execute('nope', GRANT, ADMIN)).rejects.toThrow(NotFoundError);
    });

    it('un sitio web no se verifica por acá', async () => {
        const sitio = Listing.create({
            sellerId: new UniqueEntityID(),
            assetStrategy: new WebStrategy(Money.fromCents(210000, 'USD'), 52, 'ejemplo.com'),
            askingPrice: Money.fromCents(6_800_000, 'USD'),
        });
        sitio.requestPlatformAccess(new Date());
        const { useCase } = armar(sitio, [cuenta()], [CANAL_ID]);

        await expect(useCase.execute(sitio.id.toString(), GRANT, ADMIN)).rejects.toThrow('no es un canal de YouTube');
    });

    it('sin cuenta de custodia activa para YouTube, falla antes de consultar a Google', async () => {
        const listing = conSolicitud(canal());
        const { useCase, reader } = armar(listing, [], [CANAL_ID]);

        await expect(useCase.execute(listing.id.toString(), GRANT, ADMIN)).rejects.toThrow(InvalidStateError);
        expect(reader.authorizedChannelsOf).not.toHaveBeenCalled();
    });

    it('si el canal publicado ya no existe en YouTube, es NotFoundError', async () => {
        const listing = conSolicitud(canal('https://youtube.com/@canaldeprueba'));
        const { useCase } = armar(listing, [cuenta()], [CANAL_ID], null);

        await expect(useCase.execute(listing.id.toString(), GRANT, ADMIN)).rejects.toThrow(NotFoundError);
    });
});

describe('StartPlatformAccessVerificationUseCase', () => {
    it('devuelve el identificador de la cuenta de custodia para sugerírselo a Google', async () => {
        const listing = conSolicitud(canal());
        const useCase = new StartPlatformAccessVerificationUseCase(listingRepo(listing), custodyRepo([cuenta()]));

        const result = await useCase.execute(listing.id.toString(), ADMIN);

        expect(result.custodyAccountIdentifier).toBe('custodia-yt@traspaso.com');
    });

    it('exige admin, solicitud previa y acceso sin registrar', async () => {
        const sinSolicitud = canal();
        const conAcceso = conSolicitud(canal());
        conAcceso.registerPlatformAccess({
            verifiedBy: new UniqueEntityID(),
            custodyAccountId: new UniqueEntityID(),
            heldRole: 'manager',
            accessSince: new Date(),
        });

        await expect(
            new StartPlatformAccessVerificationUseCase(listingRepo(sinSolicitud), custodyRepo([cuenta()])).execute(
                sinSolicitud.id.toString(),
                ADMIN,
            ),
        ).rejects.toThrow(InvalidStateError);
        await expect(
            new StartPlatformAccessVerificationUseCase(listingRepo(conAcceso), custodyRepo([cuenta()])).execute(
                conAcceso.id.toString(),
                ADMIN,
            ),
        ).rejects.toThrow(InvalidStateError);
        await expect(
            new StartPlatformAccessVerificationUseCase(listingRepo(sinSolicitud), custodyRepo([cuenta()])).execute(
                sinSolicitud.id.toString(),
                SELLER,
            ),
        ).rejects.toThrow(ForbiddenError);
    });
});

describe('ListListingsAwaitingAccessUseCase', () => {
    it('lista solo los activos en «verificando», de cualquier estado vigente', async () => {
        const verificando = conSolicitud(canal());
        const pendiente = canal();
        const repo = listingRepo(null, { published: [verificando, pendiente], under_review: [], in_operation: [] });

        const result = await new ListListingsAwaitingAccessUseCase(repo).execute(ADMIN);

        expect(result.map((l) => l.id.toString())).toEqual([verificando.id.toString()]);
    });

    it('es exclusivo del admin', async () => {
        await expect(new ListListingsAwaitingAccessUseCase(listingRepo(null)).execute(SELLER)).rejects.toThrow(
            ForbiddenError,
        );
    });
});
