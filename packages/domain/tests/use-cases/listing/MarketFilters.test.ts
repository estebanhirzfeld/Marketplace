import { describe, it, expect, vi } from 'vitest';
import { GetPublishedListingsUseCase } from '../../../src/use-cases/listing/GetPublishedListingsUseCase';
import { IListingRepository, ListingFilters } from '../../../src/ports/Repositories';
import { Listing } from '../../../src/entities/Listing';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../../../src/strategies/WebStrategy';
import { ValidationError } from '../../../src/errors/DomainError';

/**
 * Los filtros del mercado.
 *
 * Lo que tiene columna se resuelve en SQL; lo que vive en `assetData` o se
 * calcula, acá. Estos tests cubren la segunda mitad, que es la que el
 * repositorio no puede probar.
 */

function unCanal(over: { subs?: number; monetizado?: boolean; precio?: number } = {}): Listing {
    const l = Listing.create({
        sellerId: new UniqueEntityID(),
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(120_000, 'USD'),
            subscribers: over.subs ?? 55_000,
            isMonetized: over.monetizado ?? true,
        }),
        askingPrice: Money.fromCents(over.precio ?? 1_500_000, 'USD'),
    });
    l.submitForReview();
    l.approve();
    return l;
}

function unSitio(over: { da?: number; precio?: number } = {}): Listing {
    const l = Listing.create({
        sellerId: new UniqueEntityID(),
        assetStrategy: new WebStrategy(Money.fromCents(80_000, 'USD'), over.da ?? 42, 'ejemplo.com'),
        askingPrice: Money.fromCents(over.precio ?? 900_000, 'USD'),
    });
    l.submitForReview();
    l.approve();
    return l;
}

function unRepo(listings: Listing[] = []): IListingRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findPublished: vi.fn().mockResolvedValue(listings),
        findBySeller: vi.fn().mockResolvedValue([]),
        findByStatus: vi.fn().mockResolvedValue([]),
        findHeldBy: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function armar(listings: Listing[]): GetPublishedListingsUseCase {
    return new GetPublishedListingsUseCase(unRepo(listings));
}

const youtube: ListingFilters = { assetType: 'youtube' };
const web: ListingFilters = { assetType: 'web' };

// ═════════════════════════════════════════════════════════

describe('Filtros propios de un canal de YouTube', () => {
    it('deja pasar los canales que llegan al mínimo de suscriptores', async () => {
        const vistas = await armar([unCanal({ subs: 55_000 }), unCanal({ subs: 1_200 })]).execute({
            ...youtube,
            minSubscribers: 10_000,
        });

        expect(vistas).toHaveLength(1);
        expect(vistas[0].assetData.subscribers).toBe(55_000);
    });

    it('incluye el canal que está justo en el mínimo', async () => {
        const vistas = await armar([unCanal({ subs: 10_000 })]).execute({
            ...youtube,
            minSubscribers: 10_000,
        });

        expect(vistas).toHaveLength(1);
    });

    it('filtra por monetización', async () => {
        const vistas = await armar([
            unCanal({ monetizado: true }),
            unCanal({ monetizado: false }),
        ]).execute({ ...youtube, onlyMonetized: true });

        expect(vistas).toHaveLength(1);
    });

    it('sin el filtro de monetización devuelve los dos', async () => {
        const vistas = await armar([
            unCanal({ monetizado: true }),
            unCanal({ monetizado: false }),
        ]).execute(youtube);

        expect(vistas).toHaveLength(2);
    });
});

describe('Filtros propios de un sitio web', () => {
    it('filtra por autoridad de dominio', async () => {
        const vistas = await armar([unSitio({ da: 55 }), unSitio({ da: 12 })]).execute({
            ...web,
            minDomainAuthority: 40,
        });

        expect(vistas).toHaveLength(1);
        expect(vistas[0].assetData.domainAuthority).toBe(55);
    });
});

describe('Filtros que no corresponden al tipo elegido', () => {
    /**
     * Ignorarlos en silencio devolvería una lista vacía sin explicar por qué,
     * que para quien busca es peor que un error.
     */
    it('rechaza filtrar por suscriptores sobre sitios web', async () => {
        await expect(
            armar([]).execute({ ...web, minSubscribers: 1000 }),
        ).rejects.toThrow(ValidationError);
    });

    it('rechaza filtrar por autoridad de dominio sobre canales', async () => {
        await expect(
            armar([]).execute({ ...youtube, minDomainAuthority: 40 }),
        ).rejects.toThrow(ValidationError);
    });

    it('rechaza filtrar por suscriptores sin elegir tipo', async () => {
        await expect(armar([]).execute({ minSubscribers: 1000 })).rejects.toThrow(ValidationError);
    });
});

describe('Rango de precio', () => {
    it('sigue rechazando un mínimo mayor que el máximo', async () => {
        await expect(
            armar([]).execute({ currency: 'USD', minPrice: 500, maxPrice: 100 }),
        ).rejects.toThrow(ValidationError);
    });

    /**
     * Cien mil centavos de peso y cien mil de dólar no son comparables: un
     * rango sin moneda no significa nada.
     */
    it('rechaza un rango sin moneda', async () => {
        await expect(armar([]).execute({ minPrice: 100_000 })).rejects.toThrow(ValidationError);
        await expect(armar([]).execute({ maxPrice: 100_000 })).rejects.toThrow(ValidationError);
    });

    it('acepta el rango cuando viene con moneda', async () => {
        await expect(
            armar([unCanal()]).execute({ currency: 'USD', minPrice: 1, maxPrice: 10_000_000 }),
        ).resolves.toHaveLength(1);
    });
});

describe('Ordenamiento', () => {
    it('ordena por precio de menor a mayor', async () => {
        const vistas = await armar([
            unCanal({ precio: 3_000_000 }),
            unCanal({ precio: 1_000_000 }),
            unCanal({ precio: 2_000_000 }),
        ]).execute({ sort: 'price', direction: 'asc' });

        expect(vistas.map((v) => v.askingPrice.cents)).toEqual([1_000_000, 2_000_000, 3_000_000]);
    });

    it('ordena por precio de mayor a menor', async () => {
        const vistas = await armar([
            unCanal({ precio: 1_000_000 }),
            unCanal({ precio: 3_000_000 }),
        ]).execute({ sort: 'price', direction: 'desc' });

        expect(vistas.map((v) => v.askingPrice.cents)).toEqual([3_000_000, 1_000_000]);
    });

    /**
     * La proyección la calcula la estrategia y no está en ninguna columna: por
     * eso el orden se resuelve en el use case y no en SQL.
     */
    it('ordena por proyección de la valuación', async () => {
        const vistas = await armar([
            unCanal({ subs: 1_000, monetizado: false }),
            unCanal({ subs: 90_000, monetizado: false }),
        ]).execute({ sort: 'estimated', direction: 'desc' });

        expect(vistas[0].estimatedPrice.cents).toBeGreaterThan(vistas[1].estimatedPrice.cents);
    });

    /**
     * Con reloj falso: `approve()` sella la fecha con `new Date()`, y dos
     * listings creados en el mismo milisegundo no se pueden ordenar entre sí.
     */
    function dosPublicadosConDiferencia(): [Listing, Listing] {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-01T10:00:00Z'));
        const viejo = unCanal({ precio: 1 });

        vi.setSystemTime(new Date('2026-08-20T10:00:00Z'));
        const nuevo = unCanal({ precio: 2 });

        vi.useRealTimers();
        return [viejo, nuevo];
    }

    it('ordena por antigüedad de la publicación, lo más nuevo primero', async () => {
        const [viejo, nuevo] = dosPublicadosConDiferencia();

        const vistas = await armar([viejo, nuevo]).execute({ sort: 'published' });

        expect(vistas[0].askingPrice.cents).toBe(2);
    });

    it('lo más antiguo primero si se pide ascendente', async () => {
        const [viejo, nuevo] = dosPublicadosConDiferencia();

        const vistas = await armar([viejo, nuevo]).execute({ sort: 'published', direction: 'asc' });

        expect(vistas[0].askingPrice.cents).toBe(1);
    });

    it('ordena por antigüedad del activo en la plataforma', async () => {
        const [viejo, nuevo] = dosPublicadosConDiferencia();

        const vistas = await armar([viejo, nuevo]).execute({ sort: 'created', direction: 'asc' });

        expect(vistas[0].askingPrice.cents).toBe(1);
    });

    it('por defecto ordena por publicación descendente', async () => {
        const [viejo, nuevo] = dosPublicadosConDiferencia();

        const vistas = await armar([viejo, nuevo]).execute();

        expect(vistas[0].askingPrice.cents).toBe(2);
    });

    it('expone la fecha de publicación además de la de creación', async () => {
        const vistas = await armar([unCanal()]).execute();

        expect(vistas[0].publishedAt).toBeInstanceOf(Date);
        expect(vistas[0].createdAt).toBeInstanceOf(Date);
    });
});

// ═════════════════════════════════════════════════════════
// Los criterios se traducen uno por uno
// ═════════════════════════════════════════════════════════

/**
 * `findPublished` recibía `filters?: any` y el repositorio hacía spread de ese
 * objeto dentro del `where` de Prisma. Cualquier clave que llegara del cliente
 * terminaba en la consulta. Los criterios tienen forma declarada y se traducen
 * uno por uno.
 */
describe('GetPublishedListingsUseCase — traducción de criterios', () => {
    it('pasa los criterios al repositorio tal como los recibe', async () => {
        const repo = unRepo();
        const filtros: ListingFilters = {
            assetType: 'youtube',
            currency: 'USD',
            minPrice: 100_000,
            maxPrice: 2_000_000,
        };

        await new GetPublishedListingsUseCase(repo).execute(filtros);

        expect(repo.findPublished).toHaveBeenCalledWith(filtros);
    });

    it('sin filtros consulta todo lo publicado', async () => {
        const repo = unRepo();

        await new GetPublishedListingsUseCase(repo).execute();

        expect(repo.findPublished).toHaveBeenCalledWith(undefined);
    });

    it('rechaza un rango invertido antes de tocar la base', async () => {
        const repo = unRepo();

        await expect(
            new GetPublishedListingsUseCase(repo).execute({
                currency: 'USD',
                minPrice: 500_000,
                maxPrice: 100_000,
            }),
        ).rejects.toThrow(ValidationError);

        expect(repo.findPublished).not.toHaveBeenCalled();
    });

    it('acepta un rango donde el mínimo iguala al máximo', async () => {
        await expect(
            armar([]).execute({ currency: 'USD', minPrice: 100_000, maxPrice: 100_000 }),
        ).resolves.toEqual([]);
    });

    /**
     * El listado sigue siendo la superficie donde nunca se revelan los
     * confidenciales, con o sin filtros aplicados.
     */
    it('filtrar no cambia el ocultamiento de un listing confidencial', async () => {
        const [vista] = await armar([unCanal()]).execute({ assetType: 'youtube' });

        expect(vista.hiddenFields.length).toBeGreaterThan(0);
        for (const campo of vista.hiddenFields) {
            expect(vista.assetData).not.toHaveProperty(campo);
        }
    });
});
