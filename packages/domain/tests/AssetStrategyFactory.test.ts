import { describe, it, expect } from 'vitest';
import { createAssetStrategy } from '../src/strategies/AssetStrategyFactory';
import { YouTubeStrategy } from '../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../src/strategies/WebStrategy';
import { SocialStrategy } from '../src/strategies/SocialStrategy';
import { Money } from '../src/value-objects/Money';
import { ValidationError } from '../src/errors/DomainError';
import { AssetType } from '@marketplace/shared-types';

/**
 * El factory es la contraparte de `toJSON()`. Esa simetría es el contrato:
 * lo que una strategy serializa tiene que poder reconstruirse sin pérdida,
 * porque de eso depende la rehidratación desde la base.
 *
 * Además es la única puerta de entrada para datos que vienen de HTTP, así que
 * valida en serio en vez de confiar en la forma del JSON.
 */

describe('createAssetStrategy — round-trip con toJSON', () => {
    it('reconstruye una YouTubeStrategy sin pérdida', () => {
        const original = new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(120000, 'USD'),
            subscribers: 55000,
            growthFactor: 1.1,
            isMonetized: true,
            audienceTopCountry: 'US',
            hasNoFaceContent: true,
        });

        const json = original.toJSON();
        const reconstruida = createAssetStrategy(json.assetType, json.assetData);

        expect(reconstruida.toJSON()).toEqual(json);
        expect(reconstruida.calculateEstimatedPrice().getCents())
            .toBe(original.calculateEstimatedPrice().getCents());
    });

    it('reconstruye una WebStrategy sin pérdida', () => {
        const original = new WebStrategy(Money.fromCents(80000, 'USD'), 42);

        const json = original.toJSON();
        const reconstruida = createAssetStrategy(json.assetType, json.assetData);

        expect(reconstruida.toJSON()).toEqual(json);
        expect(reconstruida.calculateEstimatedPrice().getCents())
            .toBe(original.calculateEstimatedPrice().getCents());
    });

    const plataformasSociales: Array<AssetType.INSTAGRAM | AssetType.TIKTOK> = [
        AssetType.INSTAGRAM,
        AssetType.TIKTOK,
    ];

    it.each(plataformasSociales)(
        'reconstruye una SocialStrategy de %s sin pérdida',
        (plataforma) => {
            const original = new SocialStrategy(120000, 4.5, plataforma);

            const json = original.toJSON();
            const reconstruida = createAssetStrategy(json.assetType, json.assetData);

            expect(reconstruida.toJSON()).toEqual(json);
            expect(reconstruida.calculateEstimatedPrice().getCents())
                .toBe(original.calculateEstimatedPrice().getCents());
        },
    );
});

describe('createAssetStrategy — validación de entrada', () => {
    it('rechaza un tipo de activo desconocido', () => {
        expect(() => createAssetStrategy('podcast', {}))
            .toThrow(ValidationError);
    });

    it('rechaza un campo numérico faltante', () => {
        expect(() => createAssetStrategy(AssetType.YOUTUBE, {
            monthlyRevenueUsdCents: 120000,
            currency: 'USD',
            // falta subscribers
            isMonetized: true,
        })).toThrow(ValidationError);
    });

    it('rechaza un campo numérico con tipo equivocado', () => {
        expect(() => createAssetStrategy(AssetType.WEB, {
            monthlyRevenueUsdCents: 'ochenta mil',
            currency: 'USD',
            domainAuthority: 42,
        })).toThrow(ValidationError);
    });

    it('rechaza un booleano con tipo equivocado', () => {
        expect(() => createAssetStrategy(AssetType.YOUTUBE, {
            monthlyRevenueUsdCents: 120000,
            currency: 'USD',
            subscribers: 55000,
            isMonetized: 'sí',
        })).toThrow(ValidationError);
    });

    it('rechaza montos que no son centavos enteros', () => {
        expect(() => createAssetStrategy(AssetType.WEB, {
            monthlyRevenueUsdCents: 80000.5,
            currency: 'USD',
            domainAuthority: 42,
        })).toThrow(ValidationError);
    });

    it('aplica los valores por defecto de los campos opcionales', () => {
        const strategy = createAssetStrategy(AssetType.YOUTUBE, {
            monthlyRevenueUsdCents: 120000,
            currency: 'USD',
            subscribers: 55000,
            isMonetized: true,
        });

        const json = strategy.toJSON();
        expect(json.assetData.growthFactor).toBe(1.0);
        expect(json.assetData.audienceTopCountry).toBe('AR');
        expect(json.assetData.hasNoFaceContent).toBe(false);
    });

    it('usa USD cuando no se especifica moneda', () => {
        const strategy = createAssetStrategy(AssetType.WEB, {
            monthlyRevenueUsdCents: 80000,
            domainAuthority: 42,
        });

        expect(strategy.toJSON().assetData.currency).toBe('USD');
    });
});
