import { describe, it, expect, vi } from 'vitest';
import { GetPublishedListingsUseCase } from '../../../src/use-cases/listing/GetPublishedListingsUseCase';
import { IListingRepository } from '../../../src/ports/Repositories';
import { Listing } from '../../../src/entities/Listing';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { ValidationError } from '../../../src/errors/DomainError';

/**
 * `findPublished` recibía `filters?: any` y el repositorio hacía spread de ese
 * objeto dentro del `where` de Prisma. Cualquier clave que llegara del cliente
 * terminaba en la consulta. Ahora los criterios tienen forma declarada y se
 * traducen uno por uno.
 */

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

function unListingPublicado(): Listing {
    const listing = Listing.create({
        sellerId: new UniqueEntityID(),
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(120000, 'USD'),
            subscribers: 55000,
            isMonetized: true,
        }),
        askingPrice: Money.fromCents(1500000, 'USD'),
        isBlind: true,
    });
    listing.submitForReview();
    listing.approve();
    return listing;
}

describe('GetPublishedListingsUseCase — filtros', () => {
    it('pasa los criterios al repositorio tal como los recibe', async () => {
        const repo = createMockListingRepo();
        const filtros = { assetType: 'youtube', minPrice: 100000, maxPrice: 2000000 };

        await new GetPublishedListingsUseCase(repo).execute(filtros);

        expect(repo.findPublished).toHaveBeenCalledWith(filtros);
    });

    it('sin filtros consulta todo lo publicado', async () => {
        const repo = createMockListingRepo();

        await new GetPublishedListingsUseCase(repo).execute();

        expect(repo.findPublished).toHaveBeenCalledWith(undefined);
    });

    it('rechaza un rango de precios invertido antes de tocar la base', async () => {
        const repo = createMockListingRepo();

        await expect(
            new GetPublishedListingsUseCase(repo).execute({ minPrice: 500000, maxPrice: 100000 }),
        ).rejects.toThrow(ValidationError);

        expect(repo.findPublished).not.toHaveBeenCalled();
    });

    it('acepta un rango donde el mínimo iguala al máximo', async () => {
        const repo = createMockListingRepo();

        await expect(
            new GetPublishedListingsUseCase(repo).execute({ minPrice: 100000, maxPrice: 100000 }),
        ).resolves.toEqual([]);
    });

    // El listado sigue siendo la superficie donde nunca se revelan
    // confidenciales, con o sin filtros aplicados.
    it('filtrar no cambia el ocultamiento de un listing blind', async () => {
        const listing = unListingPublicado();
        const repo = createMockListingRepo({
            findPublished: vi.fn().mockResolvedValue([listing]),
        });

        const [vista] = await new GetPublishedListingsUseCase(repo).execute({ assetType: 'youtube' });

        expect(vista.hiddenFields.length).toBeGreaterThan(0);
        for (const campo of vista.hiddenFields) {
            expect(vista.assetData).not.toHaveProperty(campo);
        }
    });
});
