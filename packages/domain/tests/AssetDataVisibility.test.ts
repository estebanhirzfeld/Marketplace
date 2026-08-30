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

describe('Listing.assetDataFor', () => {
    it('un listing no-blind muestra todo, sin campos ocultos', () => {
        const data = unListing(false).assetDataFor(false);

        expect(data.hiddenFields).toHaveLength(0);
        expect(data.assetData.subscribers).toBe(55000);
        expect(data.assetData.monthlyRevenueUsdCents).toBe(120000);
    });

    it('un listing blind sin permiso solo expone los campos públicos', () => {
        const data = unListing(true).assetDataFor(false);

        expect(data.hiddenFields.length).toBeGreaterThan(0);
        for (const campo of data.hiddenFields) {
            expect(data.assetData).not.toHaveProperty(campo);
        }
    });

    it('un listing blind con permiso muestra todo', () => {
        const data = unListing(true).assetDataFor(true);

        expect(data.hiddenFields).toHaveLength(0);
        expect(data.assetData.subscribers).toBe(55000);
    });

    it('los campos ocultos son exactamente los que la strategy declara confidenciales', () => {
        const listing = unListing(true);
        const esperados = listing
            .toSnapshot()
            .props.assetStrategy.getConfidentialFields();

        expect(listing.assetDataFor(false).hiddenFields).toEqual(esperados);
    });

    it('nunca revela un campo que la strategy no declaró público', () => {
        const listing = unListing(true);
        const publicos = listing.toSnapshot().props.assetStrategy.getPublicFields();

        for (const clave of Object.keys(listing.assetDataFor(false).assetData)) {
            expect(publicos).toContain(clave);
        }
    });

    it('expone el tipo de activo, que nunca es confidencial', () => {
        expect(unListing(true).assetDataFor(false).assetType).toBe('youtube');
    });
});

/**
 * El ingreso declarado no se puede verificar contra ninguna API: YouTube solo
 * expone métricas monetarias en los reportes de content owner, que exigen ser
 * un MCN certificado. Como es el dato que fija el precio, afirmar que es
 * verificable sería exactamente el engaño que la plataforma existe para evitar.
 */
describe('Qué métricas puede comprobar la plataforma', () => {
    it('no declara verificable el ingreso de un canal de YouTube', () => {
        const estrategia = new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(120000, 'USD'),
            subscribers: 55000,
            isMonetized: true,
        });

        expect(estrategia.getVerifiableMetrics()).not.toContain('revenue');
        expect(estrategia.getVerifiableMetrics()).toContain('subscribers');
    });
});
