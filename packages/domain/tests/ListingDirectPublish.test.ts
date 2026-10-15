import { describe, it, expect } from 'vitest';
import { Listing } from '../src/entities/Listing';
import { Money } from '../src/value-objects/Money';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../src/strategies/WebStrategy';
import { InvalidStateError, ValidationError } from '../src/errors/DomainError';
import { AssetNiche } from '@marketplace/shared-types';

/**
 * Publicación directa, edición del borrador y cambio de precio.
 *
 * Un canal cuya titularidad ya comprobó YouTube no necesita que un admin lo
 * revise: la fuente demostró que el vendedor lo controla. Sin esa constancia
 * el camino sigue siendo la revisión.
 */

const SELLER = new UniqueEntityID();

function unCanal(): Listing {
    return Listing.create({
        sellerId: SELLER,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(120000, 'USD'),
            subscribers: 55000,
            isMonetized: true,
            audienceTopCountry: 'AR',
            channelUrl: 'https://youtube.com/@canaldeprueba',
            name: 'Canal de prueba',
            verifiedFromYouTubeAt: new Date('2026-10-01T00:00:00Z'),
        }),
        askingPrice: Money.fromCents(1_500_000, 'USD'),
    });
}

function unSitio(): Listing {
    return Listing.create({
        sellerId: SELLER,
        assetStrategy: new WebStrategy({ monthlyRevenueUsd: Money.fromCents(80000, 'USD'), domain: 'sitio.com', niche: AssetNiche.OTHER, name: 'Sitio' }),
        askingPrice: Money.fromCents(900_000, 'USD'),
    });
}

function conTitularidad(listing: Listing): Listing {
    listing.registerOwnershipVerification({
        verifiedBy: SELLER,
        assetId: 'UCq-Fj5jknLsUf-MWSy4_brA',
        source: 'youtube',
    });
    return listing;
}

describe('Listing.publish', () => {
    it('pasa de borrador a publicado, sin revisión, con la titularidad comprobada', () => {
        const listing = conTitularidad(unCanal());

        listing.publish();

        expect(listing.status).toBe('published');
        expect(listing.toSnapshot().props.publishedAt).toBeInstanceOf(Date);
    });

    it('un rechazado no puede saltarse la revisión: vuelve a pasar por submitForReview', () => {
        const listing = conTitularidad(unCanal());
        listing.submitForReview();
        listing.reject('Faltan datos');

        expect(() => listing.publish()).toThrow(InvalidStateError);
        expect(listing.status).toBe('rejected');
        expect(listing.toSnapshot().props.rejectionReason).toBe('Faltan datos');
    });

    it('se niega si la titularidad no está comprobada', () => {
        const listing = unSitio();

        expect(() => listing.publish()).toThrow(InvalidStateError);
        expect(() => listing.publish()).toThrow(/titularidad/);
        expect(listing.status).toBe('draft');
    });

    it.each(['under_review', 'published', 'in_operation'] as const)(
        'se niega desde %s',
        (estado) => {
            const listing = conTitularidad(unCanal());
            listing.submitForReview();
            if (estado !== 'under_review') listing.approve();
            if (estado === 'in_operation') listing.markInOperation();

            expect(() => listing.publish()).toThrow(InvalidStateError);
        },
    );
});

describe('Listing.editDraft', () => {
    it('cambia el rubro y el contenido sin rostro, y conserva lo que verificó YouTube', () => {
        const listing = conTitularidad(unCanal());

        listing.editDraft({ niche: AssetNiche.GAMING, hasNoFaceContent: true });

        const { assetData } = listing.assetDataFor(true);
        expect(assetData.niche).toBe(AssetNiche.GAMING);
        expect(assetData.hasNoFaceContent).toBe(true);
        expect(assetData.subscribers).toBe(55000);
        expect(assetData.monthlyRevenueUsdCents).toBe(120000);
        expect(assetData.audienceTopCountry).toBe('AR');
        expect(assetData.channelUrl).toBe('https://youtube.com/@canaldeprueba');
        expect(assetData.verifiedFromYouTubeAt).toBe('2026-10-01T00:00:00.000Z');
    });

    it('cambia el precio pedido y la moneda', () => {
        const listing = unCanal();

        listing.editDraft({ askingPrice: Money.fromCents(2_000_000, 'ARS') });

        expect(listing.askingPrice.getCents()).toBe(2_000_000);
        expect(listing.askingPrice.getCurrency()).toBe('ARS');
    });

    it('un sitio acepta el rubro pero no el contenido sin rostro', () => {
        const listing = unSitio();

        listing.editDraft({ niche: AssetNiche.TECHNOLOGY });
        expect(listing.assetDataFor(true).assetData.niche).toBe(AssetNiche.TECHNOLOGY);

        expect(() => listing.editDraft({ hasNoFaceContent: true })).toThrow(ValidationError);
    });

    it('rechaza un rubro desconocido y no modifica nada', () => {
        const listing = unCanal();

        expect(() => listing.editDraft({ niche: 'inventado' })).toThrow(ValidationError);
        expect(listing.assetDataFor(true).assetData.niche).not.toBe('inventado');
    });

    it('rechaza una edición vacía', () => {
        expect(() => unCanal().editDraft({})).toThrow(ValidationError);
    });

    it('se puede editar un rechazado', () => {
        const listing = unCanal();
        listing.submitForReview();
        listing.reject('Corregí el rubro');

        listing.editDraft({ niche: AssetNiche.TECHNOLOGY });

        expect(listing.assetDataFor(true).assetData.niche).toBe(AssetNiche.TECHNOLOGY);
    });

    it.each(['under_review', 'published', 'in_operation', 'sold'] as const)(
        'no se edita desde %s',
        (estado) => {
            const listing = conTitularidad(unCanal());
            listing.submitForReview();
            if (estado !== 'under_review') listing.approve();
            if (estado === 'in_operation' || estado === 'sold') listing.markInOperation();
            if (estado === 'sold') listing.markSold();

            expect(() => listing.editDraft({ niche: AssetNiche.TECHNOLOGY })).toThrow(InvalidStateError);
        },
    );
});

describe('Listing.changePrice', () => {
    it('cambia el precio de un publicado', () => {
        const listing = conTitularidad(unCanal());
        listing.publish();

        listing.changePrice(Money.fromCents(1_200_000, 'USD'));

        expect(listing.askingPrice.getCents()).toBe(1_200_000);
        expect(listing.status).toBe('published');
    });

    it('cambia el precio de un borrador, también de moneda', () => {
        const listing = unCanal();

        listing.changePrice(Money.fromCents(500_000_000, 'ARS'));

        expect(listing.askingPrice.getCurrency()).toBe('ARS');
    });

    it('rechaza un precio que no es positivo', () => {
        expect(() => unCanal().changePrice(Money.fromCents(0, 'USD'))).toThrow(ValidationError);
        expect(() => unCanal().changePrice(Money.fromCents(-100, 'USD'))).toThrow(ValidationError);
    });

    it.each(['under_review', 'in_operation', 'sold'] as const)(
        'no cambia el precio desde %s',
        (estado) => {
            const listing = conTitularidad(unCanal());
            listing.submitForReview();
            if (estado !== 'under_review') listing.approve();
            if (estado === 'in_operation' || estado === 'sold') listing.markInOperation();
            if (estado === 'sold') listing.markSold();

            expect(() => listing.changePrice(Money.fromCents(1, 'USD'))).toThrow(InvalidStateError);
        },
    );
});

describe('Listing.assertCanBeDiscarded', () => {
    it('deja descartar un borrador y un rechazado', () => {
        const borrador = unCanal();
        expect(() => borrador.assertCanBeDiscarded()).not.toThrow();

        const rechazado = unCanal();
        rechazado.submitForReview();
        rechazado.reject('No cierra');
        expect(() => rechazado.assertCanBeDiscarded()).not.toThrow();
    });

    it.each(['under_review', 'published', 'in_operation', 'sold'] as const)(
        'no deja descartar desde %s',
        (estado) => {
            const listing = conTitularidad(unCanal());
            listing.submitForReview();
            if (estado !== 'under_review') listing.approve();
            if (estado === 'in_operation' || estado === 'sold') listing.markInOperation();
            if (estado === 'sold') listing.markSold();

            expect(() => listing.assertCanBeDiscarded()).toThrow(InvalidStateError);
        },
    );
});
