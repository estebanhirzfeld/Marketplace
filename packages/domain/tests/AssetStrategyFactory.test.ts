import { describe, it, expect } from 'vitest';
import { createAssetStrategy } from '../src/strategies/AssetStrategyFactory';
import { YouTubeStrategy } from '../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../src/strategies/WebStrategy';
import { Money } from '../src/value-objects/Money';
import { ValidationError } from '../src/errors/DomainError';
import { AssetNiche, AssetType } from '@marketplace/shared-types';

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
        const original = new WebStrategy({
            monthlyRevenueUsd: Money.fromCents(80000, 'USD'),
            domain: 'ejemplo.com',
            niche: AssetNiche.TECHNOLOGY,
            name: 'Ejemplo',
        });

        const json = original.toJSON();
        const reconstruida = createAssetStrategy(json.assetType, json.assetData);

        expect(reconstruida.toJSON()).toEqual(json);
        expect(reconstruida.calculateEstimatedPrice().getCents())
            .toBe(original.calculateEstimatedPrice().getCents());
    });

    it('conserva rubro, nombre y dominio cada uno en su lugar', () => {
        const original = new WebStrategy({
            monthlyRevenueUsd: Money.fromCents(80000, 'USD'),
            domain: 'ejemplo.com',
            niche: AssetNiche.TECHNOLOGY,
            name: 'Ejemplo',
        });

        const json = original.toJSON();
        const { assetData } = createAssetStrategy(json.assetType, json.assetData).toJSON();

        expect(assetData.niche).toBe(AssetNiche.TECHNOLOGY);
        expect(assetData.name).toBe('Ejemplo');
        expect(assetData.domain).toBe('ejemplo.com');
    });

    /**
     * Las filas anteriores a sacar la autoridad de dominio todavía la tienen
     * guardada: leerlas no puede fallar ni devolver el dato.
     */
    it('lee un sitio guardado con autoridad de dominio, sin devolverla', () => {
        const { assetData } = createAssetStrategy(AssetType.WEB, {
            monthlyRevenueUsdCents: 80000,
            currency: 'USD',
            domainAuthority: 55,
            domain: 'ejemplo.com',
            niche: AssetNiche.TECHNOLOGY,
            name: 'Ejemplo',
        }).toJSON();

        expect(assetData).not.toHaveProperty('domainAuthority');
        expect(assetData.domain).toBe('ejemplo.com');
        expect(assetData.niche).toBe(AssetNiche.TECHNOLOGY);
    });
});

describe('createAssetStrategy — validación de entrada', () => {
    /**
     * Instagram y TikTok fueron tipos válidos y dejaron de serlo: sus términos
     * prohíben transferir una cuenta, así que el activo no se puede entregar
     * de forma legítima. Una fila vieja con ese tipo tiene que fallar y no
     * reconstruirse a medias.
     */
    it.each(['instagram', 'tiktok'])('rechaza %s, que salió del catálogo', (tipo) => {
        expect(() => createAssetStrategy(tipo, { followers: 1000 })).toThrow(ValidationError);
    });

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
        });

        expect(strategy.toJSON().assetData.currency).toBe('USD');
    });
});

describe('createAssetStrategy — fecha de verificación con YouTube', () => {
    const base = { monthlyRevenueUsdCents: 0, subscribers: 10, isMonetized: false };
    const verifiedAt = (data: Record<string, unknown>) =>
        createAssetStrategy(AssetType.YOUTUBE, { ...base, ...data }).toJSON().assetData.verifiedFromYouTubeAt;

    it('acepta un ISO 8601 completo', () => {
        expect(verifiedAt({ verifiedFromYouTubeAt: '2026-10-09T12:00:00.000Z' })).toBe('2026-10-09T12:00:00.000Z');
        expect(verifiedAt({ verifiedFromYouTubeAt: '2026-10-09T09:00:00-03:00' })).toBe('2026-10-09T12:00:00.000Z');
    });

    it('acepta una instancia de Date', () => {
        const date = new Date('2026-10-09T12:00:00.000Z');

        expect(verifiedAt({ verifiedFromYouTubeAt: date })).toBe('2026-10-09T12:00:00.000Z');
    });

    it('sin el campo queda sin marca', () => {
        expect(verifiedAt({})).toBeUndefined();
    });

    it.each([['2026'], ['2026-10-09'], ['October 9, 2026'], ['1760000000000'], ['2026-13-45T00:00:00Z'], ['no es fecha']])(
        'rechaza el texto %s: no es un ISO 8601 completo',
        (value) => {
            expect(() => createAssetStrategy(AssetType.YOUTUBE, { ...base, verifiedFromYouTubeAt: value })).toThrow(
                ValidationError,
            );
        },
    );

    it('rechaza un Date inválido y valores que no son texto ni fecha', () => {
        for (const value of [new Date('x'), 1760000000000, true, {}]) {
            expect(() => createAssetStrategy(AssetType.YOUTUBE, { ...base, verifiedFromYouTubeAt: value })).toThrow(
                ValidationError,
            );
        }
    });
});
