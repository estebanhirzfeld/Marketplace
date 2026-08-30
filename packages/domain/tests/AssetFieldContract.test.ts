import { describe, it, expect } from 'vitest';
import { IAssetStrategy } from '../src/strategies/IAssetStrategy';
import { YouTubeStrategy } from '../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../src/strategies/WebStrategy';
import { SocialStrategy } from '../src/strategies/SocialStrategy';
import { Listing } from '../src/entities/Listing';
import { Money } from '../src/value-objects/Money';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { AssetType } from '@marketplace/shared-types';

/**
 * El contrato entre lo que una estrategia DECLARA y lo que efectivamente
 * GUARDA.
 *
 * Sin este test las dos listas se escribieron en snake_case mientras
 * `assetData` usaba camelCase, así que ningún nombre coincidía: un listing
 * blind terminaba ocultando también los campos que decía publicar, y
 * `hiddenFields` nombraba campos que no existían en ningún lado. Las listas
 * estaban bien escritas y el filtro estaba bien escrito; lo que nadie
 * comprobaba era que hablaran del mismo conjunto de datos.
 */

const ESTRATEGIAS: Array<[string, IAssetStrategy]> = [
    [
        'YouTube',
        new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(120000, 'USD'),
            subscribers: 55000,
            isMonetized: true,
            channelUrl: 'https://youtube.com/@midudev',
        }),
    ],
    ['Web', new WebStrategy(Money.fromCents(80000, 'USD'), 42, 'ejemplo.com')],
    [
        'Social',
        new SocialStrategy(90000, 3.2, AssetType.INSTAGRAM, 'https://instagram.com/ejemplo'),
    ],
];

describe.each(ESTRATEGIAS)('%s — contrato de campos', (_nombre, estrategia) => {
    const { assetData } = estrategia.toJSON();
    const claves = Object.keys(assetData);

    it('publica solo campos que existen en assetData', () => {
        for (const campo of estrategia.getPublicFields()) {
            expect(claves).toContain(campo);
        }
    });

    it('reserva solo campos que existen en assetData', () => {
        for (const campo of estrategia.getConfidentialFields()) {
            expect(claves).toContain(campo);
        }
    });

    it('no declara un campo como público y confidencial a la vez', () => {
        const publicos = new Set(estrategia.getPublicFields());
        const reservados = estrategia.getConfidentialFields().filter((c) => publicos.has(c));

        expect(reservados).toEqual([]);
    });

    it('clasifica todos los campos que guarda', () => {
        const clasificados = new Set([
            ...estrategia.getPublicFields(),
            ...estrategia.getConfidentialFields(),
        ]);

        // Un campo sin clasificar es un campo que nadie decidió si se muestra.
        expect(claves.filter((c) => !clasificados.has(c))).toEqual([]);
    });
});

describe.each(ESTRATEGIAS)('%s — el filtrado real de un listing blind', (_nombre, estrategia) => {
    function unListingBlind(): Listing {
        return Listing.create({
            sellerId: new UniqueEntityID(),
            assetStrategy: estrategia,
            askingPrice: Money.fromCents(1_000_000, 'USD'),
            isBlind: true,
        });
    }

    /**
     * La prueba que faltaba: no que las listas digan lo correcto, sino que el
     * comprador sin NDA efectivamente reciba los campos públicos.
     */
    it('entrega los campos públicos a quien no firmó el NDA', () => {
        const { assetData } = unListingBlind().assetDataFor(false);

        for (const campo of estrategia.getPublicFields()) {
            expect(assetData).toHaveProperty(campo);
        }
    });

    it('retiene todos los confidenciales', () => {
        const { assetData } = unListingBlind().assetDataFor(false);

        for (const campo of estrategia.getConfidentialFields()) {
            expect(assetData).not.toHaveProperty(campo);
        }
    });

    it('los revela una vez firmado el NDA', () => {
        const { assetData, hiddenFields } = unListingBlind().assetDataFor(true);

        for (const campo of estrategia.getConfidentialFields()) {
            expect(assetData).toHaveProperty(campo);
        }
        expect(hiddenFields).toEqual([]);
    });
});
