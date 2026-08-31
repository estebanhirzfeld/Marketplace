import { describe, it, expect } from 'vitest';
import { Listing } from '../src/entities/Listing';
import { YouTubeStrategy } from '../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../src/strategies/WebStrategy';
import { createAssetStrategy } from '../src/strategies/AssetStrategyFactory';
import { Money } from '../src/value-objects/Money';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { AssetNiche, AssetType } from '@marketplace/shared-types';

/*
 * El nombre del activo es parte del blindaje.
 *
 * Con el nombre de un canal o de un sitio se lo encuentra buscándolo, igual
 * que con su dirección. Si el nombre fuera público, esconder la dirección
 * sería un trámite vacío: el comprador identificaría el activo sin firmar
 * nada y el acuerdo de confidencialidad no protegería al vendedor de lo único
 * que tiene que protegerlo.
 */

const NOMBRE_DEL_CANAL = 'Nivel Completo';
const NOMBRE_DEL_SITIO = 'Probamos Todo';

function canal() {
    return new YouTubeStrategy({
        monthlyRevenueUsd: Money.fromCents(45000, 'USD'),
        subscribers: 92000,
        isMonetized: true,
        channelUrl: 'https://youtube.com/@nivelcompleto',
        name: NOMBRE_DEL_CANAL,
        niche: AssetNiche.GAMING,
    });
}

function sitio() {
    return new WebStrategy(
        Money.fromCents(135000, 'USD'),
        41,
        'probamostodo.com',
        AssetNiche.TECHNOLOGY,
        NOMBRE_DEL_SITIO,
    );
}

function publicado(strategy: ReturnType<typeof canal> | ReturnType<typeof sitio>) {
    const listing = Listing.create({
        sellerId: new UniqueEntityID(),
        assetStrategy: strategy,
        askingPrice: Money.fromCents(950000, 'USD'),
    });
    listing.submitForReview();
    listing.approve();
    return listing;
}

describe('El nombre del activo', () => {
    it('no se muestra a quien no tiene acceso a los datos reservados', () => {
        for (const [listing, nombre] of [
            [publicado(canal()), NOMBRE_DEL_CANAL],
            [publicado(sitio()), NOMBRE_DEL_SITIO],
        ] as const) {
            const { assetData, hiddenFields } = listing.assetDataFor(false);

            expect(JSON.stringify(assetData)).not.toContain(nombre);
            expect(hiddenFields).toContain('name');
        }
    });

    it('se muestra a quien sí lo tiene', () => {
        expect(publicado(canal()).assetDataFor(true).assetData.name).toBe(NOMBRE_DEL_CANAL);
        expect(publicado(sitio()).assetDataFor(true).assetData.name).toBe(NOMBRE_DEL_SITIO);
    });

    it('sobrevive a la vuelta por la base', () => {
        for (const strategy of [canal(), sitio()]) {
            const { assetType, assetData } = strategy.toJSON();
            const rehidratada = createAssetStrategy(assetType, assetData);

            expect(rehidratada.toJSON().assetData.name).toBe(assetData.name);
        }
    });

    it('deja el rubro donde estaba: los argumentos posicionales se corren solos', () => {
        // El nombre se agregó al final del constructor de WebStrategy por esto
        // mismo. Insertarlo en el medio hizo que el rubro de un sitio pasara a
        // ser su nombre, en silencio y sin que fallara la compilación.
        expect(sitio().toJSON().assetData.niche).toBe(AssetNiche.TECHNOLOGY);
        expect(canal().toJSON().assetData.niche).toBe(AssetNiche.GAMING);
    });

    it('un activo sin nombre no rompe nada', () => {
        const sinNombre = createAssetStrategy(AssetType.WEB, {
            monthlyRevenueUsdCents: 100000,
            domainAuthority: 30,
        });

        expect(sinNombre.toJSON().assetData.name).toBe('');
    });
});
