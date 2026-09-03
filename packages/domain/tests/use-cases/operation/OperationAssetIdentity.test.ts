import { describe, it, expect, vi } from 'vitest';
import { GetMyOperationsUseCase } from '../../../src/use-cases/operation/GetMyOperationsUseCase';
import { IListingRepository, IOperationRepository } from '../../../src/ports/Repositories';
import { Actor } from '../../../src/ports/Actor';
import { Listing } from '../../../src/entities/Listing';
import { Operation } from '../../../src/entities/Operation';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../../../src/strategies/WebStrategy';
import { AssetNiche, UserRole } from '@marketplace/shared-types';

/**
 * Cada operación tiene que decir sobre qué activo es.
 *
 * La lista mostraba estado, posición y monto, así que tres operaciones solo se
 * distinguían por el precio y había que entrar a cada una para saber cuál era
 * cuál. El rubro y el tipo son datos públicos de la strategy —los mismos que
 * ya se ven en el mercado sin firmar nada—, así que nombrarlos acá no filtra
 * la identidad del activo, que sigue detrás del NDA.
 */

const SELLER_ID = new UniqueEntityID();
const BUYER_ID = new UniqueEntityID();
const LISTING_ID = new UniqueEntityID();

const BUYER: Actor = { id: BUYER_ID.toString(), role: UserRole.BUYER };

const CANAL = Listing.reconstitute(
    {
        sellerId: SELLER_ID,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(120000, 'USD'),
            subscribers: 55000,
            isMonetized: true,
            niche: AssetNiche.FINANCE,
            channelUrl: 'https://youtube.com/@reservado',
        }),
        askingPrice: Money.fromCents(3600000, 'USD'),
        status: 'published',
        publishedAt: new Date(),
    },
    LISTING_ID,
    new Date(),
);

function unaOperacion(): Operation {
    return Operation.create({
        listingId: LISTING_ID,
        buyerId: BUYER_ID,
        sellerId: SELLER_ID,
        offerPrice: Money.fromCents(3000000, 'USD'),
    });
}

function armar(listing: Listing | null) {
    const operationRepo: IOperationRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findByListing: vi.fn().mockResolvedValue([]),
        findByParty: vi.fn().mockResolvedValue([unaOperacion()]),
        findByStatuses: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
    const listingRepo: IListingRepository = {
        findById: vi.fn().mockResolvedValue(listing),
        findPublished: vi.fn().mockResolvedValue([]),
        findBySeller: vi.fn().mockResolvedValue([]),
        findByStatus: vi.fn().mockResolvedValue([]),
        findHeldBy: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
    return new GetMyOperationsUseCase(operationRepo, listingRepo, {
            findById: vi.fn().mockResolvedValue(null),
            findByOperation: vi.fn().mockResolvedValue([]),
            findByListingAndSigner: vi.fn().mockResolvedValue(null),
            findAllByListing: vi.fn().mockResolvedValue([]),
            save: vi.fn().mockResolvedValue(undefined),
        });
}

describe('GetMyOperationsUseCase — identidad del activo', () => {
    it('acompaña cada operación con el tipo y el rubro del activo', async () => {
        const [vista] = await armar(CANAL).execute(BUYER);

        expect(vista.assetType).toBe('youtube');
        expect(vista.niche).toBe(AssetNiche.FINANCE);
    });

    /** La identidad sigue siendo reservada: el rubro no la revela. */
    it('no expone los datos confidenciales del activo', async () => {
        const [vista] = await armar(CANAL).execute(BUYER);

        expect(JSON.stringify(vista)).not.toContain('@reservado');
    });

    it('sigue devolviendo la operación entera', async () => {
        const [vista] = await armar(CANAL).execute(BUYER);

        expect(vista.operation.currentOfferPrice.getCents()).toBe(3000000);
    });

    /**
     * Si el activo desapareció, la operación no puede desaparecer con él: es
     * el registro de una compraventa y las partes tienen que poder abrirla.
     */
    it('no se cae si el activo ya no está', async () => {
        const [vista] = await armar(null).execute(BUYER);

        expect(vista.operation).toBeDefined();
        expect(vista.assetType).toBeUndefined();
    });

    it('funciona igual para un sitio web', async () => {
        const sitio = Listing.reconstitute(
            {
                sellerId: SELLER_ID,
                assetStrategy: new WebStrategy(
                    Money.fromCents(210000, 'USD'),
                    52,
                    'reservado.com',
                    AssetNiche.TECHNOLOGY,
                ),
                askingPrice: Money.fromCents(6800000, 'USD'),
                status: 'published',
                publishedAt: new Date(),
            },
            LISTING_ID,
            new Date(),
        );

        const [vista] = await armar(sitio).execute(BUYER);

        expect(vista.assetType).toBe('web');
        expect(vista.niche).toBe(AssetNiche.TECHNOLOGY);
        expect(JSON.stringify(vista)).not.toContain('reservado.com');
    });
});
