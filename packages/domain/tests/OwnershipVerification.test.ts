import { describe, it, expect } from 'vitest';
import { Listing } from '../src/entities/Listing';
import { Money } from '../src/value-objects/Money';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../src/strategies/YouTubeStrategy';
import { ValidationError } from '../src/errors/DomainError';

/**
 * La constancia de que el vendedor controla el activo.
 *
 * Es la única de las tres que sale de una fuente externa y no de la palabra de
 * una persona: la propia API de Google devuelve qué canales controla quien dio
 * el permiso. Por eso guarda el identificador canónico que devolvió la fuente
 * y no el que el vendedor había escrito.
 */

const SELLER = new UniqueEntityID();

function unCanal(): Listing {
    return Listing.create({
        sellerId: SELLER,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(120000, 'USD'),
            subscribers: 55000,
            isMonetized: true,
            channelUrl: 'https://youtube.com/@canaldeprueba',
        }),
        askingPrice: Money.fromCents(1_500_000, 'USD'),
    });
}

const CANAL_ID = 'UCq-Fj5jknLsUf-MWSy4_brA';

describe('Listing.registerOwnershipVerification', () => {
    it('guarda quién demostró el control, sobre qué activo y desde qué fuente', () => {
        const listing = unCanal();

        listing.registerOwnershipVerification({
            verifiedBy: SELLER,
            assetId: CANAL_ID,
            source: 'youtube',
        });

        const constancia = listing.ownershipVerification;
        expect(constancia?.verifiedBy.toString()).toBe(SELLER.toString());
        expect(constancia?.assetId).toBe(CANAL_ID);
        expect(constancia?.source).toBe('youtube');
        expect(constancia?.verifiedAt).toBeInstanceOf(Date);
    });

    it('un listing recién creado no tiene la titularidad comprobada', () => {
        expect(unCanal().ownershipVerification).toBeUndefined();
        expect(unCanal().isOwnershipVerified()).toBe(false);
    });

    it('queda comprobada una vez registrada', () => {
        const listing = unCanal();

        listing.registerOwnershipVerification({
            verifiedBy: SELLER,
            assetId: CANAL_ID,
            source: 'youtube',
        });

        expect(listing.isOwnershipVerified()).toBe(true);
    });

    it('rechaza un registro sin identificador del activo', () => {
        expect(() =>
            unCanal().registerOwnershipVerification({
                verifiedBy: SELLER,
                assetId: '   ',
                source: 'youtube',
            }),
        ).toThrow(ValidationError);
    });

    it('rechaza un registro sin quién lo demostró', () => {
        expect(() =>
            unCanal().registerOwnershipVerification({
                verifiedBy: undefined as never,
                assetId: CANAL_ID,
                source: 'youtube',
            }),
        ).toThrow(ValidationError);
    });
});

describe('La titularidad se comprueba de nuevo si el activo cambia de manos', () => {
    /**
     * La constancia dice que una persona controlaba un activo en una fecha. Si
     * el vendedor publica otro canal en el mismo listing, lo comprobado deja de
     * corresponderse con lo publicado y hay que volver a comprobarlo.
     */
    it('registrar otro activo reemplaza la constancia anterior', () => {
        const listing = unCanal();
        listing.registerOwnershipVerification({
            verifiedBy: SELLER,
            assetId: CANAL_ID,
            source: 'youtube',
        });

        const otro = 'UCabcdefghijklmnopqrstuv';
        listing.registerOwnershipVerification({
            verifiedBy: SELLER,
            assetId: otro,
            source: 'youtube',
        });

        expect(listing.ownershipVerification?.assetId).toBe(otro);
    });
});
