import { describe, it, expect, vi } from 'vitest';
import {
    VerifyChannelOwnershipUseCase,
    VerifyWebsiteRevenueUseCase,
} from '../../../src/use-cases/listing/VerifyOwnershipUseCases';
import { IListingRepository } from '../../../src/ports/Repositories';
import { IYouTubeChannelReader } from '../../../src/ports/IYouTubeChannelReader';
import {
    AdSenseEarnings,
    IAdSenseReader,
    IYouTubeOwnershipReader,
    OwnedYouTubeChannel,
} from '../../../src/ports/IOwnershipReaders';
import { Actor } from '../../../src/ports/Actor';
import { Listing } from '../../../src/entities/Listing';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../../../src/strategies/WebStrategy';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

const SELLER_ID = new UniqueEntityID();
const CANAL_ID = 'UCq-Fj5jknLsUf-MWSy4_brA';
const GRANT = 'codigo-de-autorizacion';

const SELLER: Actor = { id: SELLER_ID.toString(), role: UserRole.SELLER };
const ADMIN: Actor = { id: 'admin-1', role: UserRole.ADMIN };
const AJENO: Actor = { id: new UniqueEntityID().toString(), role: UserRole.BUYER };

function createMockListingRepo(listing: Listing | null): IListingRepository {
    return {
        findById: vi.fn().mockResolvedValue(listing),
        findPublished: vi.fn().mockResolvedValue([]),
        findBySeller: vi.fn().mockResolvedValue([]),
        findByStatus: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function unCanalPublicado(channelUrl = 'https://youtube.com/@canaldeprueba'): Listing {
    return Listing.create({
        sellerId: SELLER_ID,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(120000, 'USD'),
            subscribers: 55000,
            isMonetized: true,
            channelUrl,
        }),
        askingPrice: Money.fromCents(1_500_000, 'USD'),
    });
}

function unSitio(domain = 'ejemplo.com'): Listing {
    return Listing.create({
        sellerId: SELLER_ID,
        assetStrategy: new WebStrategy(Money.fromCents(80000, 'USD'), 42, domain),
        askingPrice: Money.fromCents(900_000, 'USD'),
    });
}

const lectorPublico = (channelId: string | null): IYouTubeChannelReader => ({
    read: vi.fn().mockResolvedValue(
        channelId === null
            ? null
            : { channelId, title: 'Canal', views: 1, publicVideos: 1, readAt: new Date() },
    ),
});

const lectorDePropios = (canales: OwnedYouTubeChannel[]): IYouTubeOwnershipReader => ({
    channelsOf: vi.fn().mockResolvedValue(canales),
});

const lectorAdSense = (ingreso: AdSenseEarnings | null): IAdSenseReader => ({
    monthlyEarningsFor: vi.fn().mockResolvedValue(ingreso),
});

const UN_INGRESO: AdSenseEarnings = {
    earningsCents: 78_450,
    currency: 'USD',
    from: new Date('2026-07-01'),
    to: new Date('2026-07-31'),
};

// ═════════════════════════════════════════════════════════

describe('VerifyChannelOwnershipUseCase', () => {
    function armar(
        listing: Listing | null,
        propios: OwnedYouTubeChannel[],
        publicado: string | null = CANAL_ID,
    ) {
        const repo = createMockListingRepo(listing);
        const uso = new VerifyChannelOwnershipUseCase(
            repo,
            lectorDePropios(propios),
            lectorPublico(publicado),
        );
        return { uso, repo };
    }

    it('deja constancia cuando el canal publicado está entre los que controla', async () => {
        const listing = unCanalPublicado();
        const { uso, repo } = armar(listing, [{ channelId: CANAL_ID, title: 'Canal' }]);

        const constancia = await uso.execute('l1', GRANT, SELLER);

        expect(constancia.assetId).toBe(CANAL_ID);
        expect(constancia.source).toBe('youtube');
        expect(listing.isOwnershipVerified()).toBe(true);
        expect(repo.save).toHaveBeenCalledOnce();
    });

    /**
     * El fraude que esto elimina: publicar un canal ajeno. La cuenta que
     * autoriza controla canales, pero no el que está a la venta.
     */
    it('rechaza si la cuenta controla otros canales pero no el publicado', async () => {
        const listing = unCanalPublicado();
        const { uso } = armar(listing, [{ channelId: 'UCotroCanalxxxxxxxxxxxx', title: 'Otro' }]);

        await expect(uso.execute('l1', GRANT, SELLER)).rejects.toThrow(ForbiddenError);
        expect(listing.isOwnershipVerified()).toBe(false);
    });

    it('menciona las Cuentas de Marca al explicar el rechazo', async () => {
        const { uso } = armar(unCanalPublicado(), []);

        await expect(uso.execute('l1', GRANT, SELLER)).rejects.toThrow(/Cuenta de Marca/);
    });

    /**
     * La comparación va por ID y no por handle porque un handle se puede
     * cambiar: publicar `@canalA`, cambiarlo a `@canalB` y verificar contra
     * otro canal sería trivial si comparáramos texto.
     */
    it('resuelve el handle publicado a su identificador antes de comparar', async () => {
        const listing = unCanalPublicado('https://youtube.com/@canaldeprueba');
        const { uso } = armar(listing, [{ channelId: CANAL_ID, title: 'Canal' }]);

        const constancia = await uso.execute('l1', GRANT, SELLER);

        expect(constancia.assetId).toBe(CANAL_ID);
    });

    it('deja verificar a un admin', async () => {
        const { uso } = armar(unCanalPublicado(), [{ channelId: CANAL_ID, title: 'Canal' }]);

        await expect(uso.execute('l1', GRANT, ADMIN)).resolves.toBeDefined();
    });

    it('rechaza a un tercero', async () => {
        const { uso } = armar(unCanalPublicado(), [{ channelId: CANAL_ID, title: 'Canal' }]);

        await expect(uso.execute('l1', GRANT, AJENO)).rejects.toThrow(ForbiddenError);
    });

    it('falla si el canal publicado ya no está en YouTube', async () => {
        const { uso } = armar(unCanalPublicado(), [], null);

        await expect(uso.execute('l1', GRANT, SELLER)).rejects.toThrow(NotFoundError);
    });

    it('falla si el activo no es un canal', async () => {
        const { uso } = armar(unSitio(), []);

        await expect(uso.execute('l1', GRANT, SELLER)).rejects.toThrow(ValidationError);
    });

    it('falla si el listing no existe', async () => {
        const { uso } = armar(null, []);

        await expect(uso.execute('l1', GRANT, SELLER)).rejects.toThrow(NotFoundError);
    });
});

// ═════════════════════════════════════════════════════════

describe('VerifyWebsiteRevenueUseCase', () => {
    function armar(listing: Listing | null, ingreso: AdSenseEarnings | null) {
        const repo = createMockListingRepo(listing);
        return { uso: new VerifyWebsiteRevenueUseCase(repo, lectorAdSense(ingreso)), repo };
    }

    /**
     * La única verificación que alcanza el dato que fija el precio. Que la
     * cuenta reporte ese dominio prueba dos cosas de una: que el vendedor
     * controla la cuenta que cobra y que ese sitio es el que genera el ingreso.
     */
    it('guarda el ingreso comprobado, no el declarado', async () => {
        const listing = unSitio();
        const { uso } = armar(listing, UN_INGRESO);

        const constancia = await uso.execute('l1', GRANT, SELLER);

        expect(constancia.monthlyRevenueCents).toBe(78_450);
        expect(constancia.assetId).toBe('ejemplo.com');
        expect(constancia.source).toBe('adsense');
    });

    it('deja el listing con la titularidad comprobada', async () => {
        const listing = unSitio();
        const { uso, repo } = armar(listing, UN_INGRESO);

        await uso.execute('l1', GRANT, SELLER);

        expect(listing.isOwnershipVerified()).toBe(true);
        expect(repo.save).toHaveBeenCalledOnce();
    });

    /**
     * Que la cuenta no reporte el dominio no es un error técnico: es la
     * respuesta. Quien autorizó no es quien monetiza ese sitio.
     */
    it('rechaza si la cuenta de AdSense no reporta ese dominio', async () => {
        const listing = unSitio();
        const { uso } = armar(listing, null);

        await expect(uso.execute('l1', GRANT, SELLER)).rejects.toThrow(ForbiddenError);
        expect(listing.isOwnershipVerified()).toBe(false);
    });

    it('consulta por el dominio publicado', async () => {
        const repo = createMockListingRepo(unSitio('otrodominio.com'));
        const adsense = lectorAdSense(UN_INGRESO);
        await new VerifyWebsiteRevenueUseCase(repo, adsense).execute('l1', GRANT, SELLER);

        expect(adsense.monthlyEarningsFor).toHaveBeenCalledWith(GRANT, 'otrodominio.com');
    });

    it('falla si el activo no es un sitio web', async () => {
        const { uso } = armar(unCanalPublicado(), UN_INGRESO);

        await expect(uso.execute('l1', GRANT, SELLER)).rejects.toThrow(ValidationError);
    });

    it('rechaza a un tercero', async () => {
        const { uso } = armar(unSitio(), UN_INGRESO);

        await expect(uso.execute('l1', GRANT, AJENO)).rejects.toThrow(ForbiddenError);
    });
});
