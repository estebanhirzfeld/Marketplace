import { describe, it, expect } from 'vitest';
import { Listing } from '../src/entities/Listing';
import { Money } from '../src/value-objects/Money';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../src/strategies/YouTubeStrategy';

/**
 * Qué datos de un activo son visibles es una regla de negocio, no de la vista.
 *
 * Vivía únicamente dentro de GetListingDetailsUseCase, así que la ruta pública
 * `GET /listings` la salteaba: agregar `assetData` al listado habría publicado
 * los campos confidenciales de un listing blind. La regla se mudó a la entidad
 * para que haya un solo lugar donde consultarla.
 */

function unListing(isBlind: boolean): Listing {
    return Listing.create({
        sellerId: new UniqueEntityID(),
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(120000, 'USD'),
            subscribers: 55000,
            isMonetized: true,
            audienceTopCountry: 'US',
        }),
        askingPrice: Money.fromCents(1500000, 'USD'),
        isBlind,
    });
}

describe('Listing.datosDelActivo', () => {
    it('un listing no-blind muestra todo, sin campos ocultos', () => {
        const datos = unListing(false).datosDelActivo(false);

        expect(datos.hiddenFields).toHaveLength(0);
        expect(datos.assetData.subscribers).toBe(55000);
        expect(datos.assetData.monthlyRevenueUsdCents).toBe(120000);
    });

    it('un listing blind sin permiso solo expone los campos públicos', () => {
        const datos = unListing(true).datosDelActivo(false);

        expect(datos.hiddenFields.length).toBeGreaterThan(0);
        for (const campo of datos.hiddenFields) {
            expect(datos.assetData).not.toHaveProperty(campo);
        }
    });

    it('un listing blind con permiso muestra todo', () => {
        const datos = unListing(true).datosDelActivo(true);

        expect(datos.hiddenFields).toHaveLength(0);
        expect(datos.assetData.subscribers).toBe(55000);
    });

    it('los campos ocultos son exactamente los que la strategy declara confidenciales', () => {
        const listing = unListing(true);
        const esperados = listing
            .toSnapshot()
            .props.assetStrategy.getConfidentialFields();

        expect(listing.datosDelActivo(false).hiddenFields).toEqual(esperados);
    });

    it('nunca revela un campo que la strategy no declaró público', () => {
        const listing = unListing(true);
        const publicos = listing.toSnapshot().props.assetStrategy.getPublicFields();

        for (const clave of Object.keys(listing.datosDelActivo(false).assetData)) {
            expect(publicos).toContain(clave);
        }
    });

    it('expone el tipo de activo, que nunca es confidencial', () => {
        expect(unListing(true).datosDelActivo(false).assetType).toBe('youtube');
    });
});
