import { describe, it, expect } from 'vitest';
import { Listing } from '../src/entities/Listing';
import { Money } from '../src/value-objects/Money';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { YouTubeStrategy } from '../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../src/strategies/WebStrategy';
import { IAssetStrategy } from '../src/strategies/IAssetStrategy';

/**
 * Todo activo se publica blindado, sin excepción.
 *
 * Antes era una opción del formulario: quien publicaba podía destildarla y
 * exponer la dirección de su canal a cualquiera que entrara al mercado. Que
 * dependiera de un checkbox significaba que un descuido —o un valor por
 * defecto mal puesto en cualquier capa— filtraba la identidad del activo.
 *
 * Ya no es una opción sino una propiedad de la entidad: `Listing` no tiene
 * forma de representar un activo no blindado. La identidad se revela cuando
 * alguien la puede ver, no cuando alguien la dejó abierta.
 */

const ESTRATEGIAS: Array<[string, IAssetStrategy]> = [
    [
        'YouTube',
        new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(120000, 'USD'),
            subscribers: 55000,
            isMonetized: true,
            channelUrl: 'https://youtube.com/@canaldeprueba',
        }),
    ],
    ['Web', new WebStrategy(Money.fromCents(80000, 'USD'), 42, 'ejemplo.com')],
];

function unListing(estrategia: IAssetStrategy): Listing {
    return Listing.create({
        sellerId: new UniqueEntityID(),
        assetStrategy: estrategia,
        askingPrice: Money.fromCents(1_500_000, 'USD'),
    });
}

describe.each(ESTRATEGIAS)('%s — se publica blindado siempre', (_nombre, estrategia) => {
    it('esconde los campos confidenciales a quien no puede verlos', () => {
        const { assetData, hiddenFields } = unListing(estrategia).assetDataFor(false);

        for (const campo of estrategia.getConfidentialFields()) {
            expect(assetData).not.toHaveProperty(campo);
        }
        expect(hiddenFields).toEqual(estrategia.getConfidentialFields());
    });

    it('entrega los campos públicos igual', () => {
        const { assetData } = unListing(estrategia).assetDataFor(false);

        for (const campo of estrategia.getPublicFields()) {
            expect(assetData).toHaveProperty(campo);
        }
    });

    it('los revela a quien sí puede verlos', () => {
        const { assetData, hiddenFields } = unListing(estrategia).assetDataFor(true);

        for (const campo of estrategia.getConfidentialFields()) {
            expect(assetData).toHaveProperty(campo);
        }
        expect(hiddenFields).toEqual([]);
    });
});

describe('La identidad del activo nunca sale sin permiso', () => {
    /**
     * El caso concreto que motivó el cambio: la dirección del canal apareció
     * en el mercado, visible sin sesión y sin NDA firmado.
     */
    it('no expone la dirección del canal en la vista sin permiso', () => {
        const listing = unListing(ESTRATEGIAS[0][1]);

        const { assetData } = listing.assetDataFor(false);

        expect(assetData).not.toHaveProperty('channelUrl');
        expect(JSON.stringify(assetData)).not.toContain('youtube.com/@');
    });

    it('no expone el dominio de un sitio web', () => {
        const { assetData } = unListing(ESTRATEGIAS[1][1]).assetDataFor(false);

        expect(assetData).not.toHaveProperty('domain');
        expect(JSON.stringify(assetData)).not.toContain('ejemplo.com');
    });
});
