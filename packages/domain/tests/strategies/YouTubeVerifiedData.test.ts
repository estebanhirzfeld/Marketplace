import { describe, it, expect } from 'vitest';
import { YouTubeStrategy } from '../../src/strategies/YouTubeStrategy';
import { createAssetStrategy } from '../../src/strategies/AssetStrategyFactory';
import { Money } from '../../src/value-objects/Money';
import { AssetType } from '@marketplace/shared-types';

/**
 * Lo que Google informa y lo que no. Dos cosas que la prueba real mostró mal:
 * el aviso de ingreso decía que YouTube no expone los ingresos aunque el activo
 * los traía verificados, y un canal sin país de Google salía con "AR" inventado
 * y restaba 3 al múltiplo de la valuación.
 */

const READ_AT = new Date('2026-10-10T01:35:37.265Z');

function verified(over: { revenueCents?: number; monetized?: boolean; country?: string } = {}) {
    return new YouTubeStrategy({
        monthlyRevenueUsd: Money.fromCents(over.revenueCents ?? 60_000, 'USD'),
        subscribers: 12_000,
        isMonetized: over.monetized ?? true,
        ...(over.country ? { audienceTopCountry: over.country } : {}),
        verifiedFromYouTubeAt: READ_AT,
    });
}

function manual(country?: string) {
    return new YouTubeStrategy({
        monthlyRevenueUsd: Money.fromCents(60_000, 'USD'),
        subscribers: 12_000,
        isMonetized: true,
        ...(country ? { audienceTopCountry: country } : {}),
    });
}

describe('YouTubeStrategy.describe().revenueNotice', () => {
    it('un activo cargado a mano conserva el aviso de declaración jurada', () => {
        expect(manual().describe().revenueNotice).toMatch(/no expone los ingresos/i);
    });

    it('un activo verificado sin ingresos lo dice con palabras', () => {
        const notice = verified({ revenueCents: 0, monetized: false }).describe().revenueNotice;

        expect(notice).toBe('Verificado con YouTube: sin ingresos en los últimos 12 meses.');
    });

    it('un activo verificado con ingresos da el promedio mensual y su período', () => {
        const notice = verified({ revenueCents: 60_000 }).describe().revenueNotice;

        expect(notice).toBe('Verificado con YouTube: US$ 600 por mes, promedio de los últimos 3 meses.');
    });

    it('un activo verificado y monetizado con promedio en cero no afirma 12 meses sin ingresos', () => {
        const notice = verified({ revenueCents: 0, monetized: true }).describe().revenueNotice;

        expect(notice).toBe('Verificado con YouTube: sin ingresos en los últimos 3 meses.');
    });

    it('ninguno de los avisos verificados dice que YouTube no expone los ingresos', () => {
        for (const s of [verified(), verified({ revenueCents: 0, monetized: false })]) {
            expect(s.describe().revenueNotice).not.toMatch(/no expone/i);
        }
    });
});

describe('YouTubeStrategy: país de la audiencia', () => {
    it('un activo manual sin país conserva el AR de siempre', () => {
        expect(manual().toJSON().assetData.audienceTopCountry).toBe('AR');
    });

    it('un activo verificado sin país no inventa uno', () => {
        expect(verified().toJSON().assetData.audienceTopCountry).toBeNull();
    });

    it('un activo verificado con país lo conserva', () => {
        expect(verified({ country: 'US' }).toJSON().assetData.audienceTopCountry).toBe('US');
    });

    it('se rehidrata sin país y sigue sin país', () => {
        const original = verified().toJSON();
        const rehydrated = createAssetStrategy(AssetType.YOUTUBE, original.assetData);

        expect(rehydrated.toJSON()).toEqual(original);
    });

    it('un activo manual cuyo país viene nulo sigue cayendo en AR', () => {
        const s = createAssetStrategy(AssetType.YOUTUBE, {
            monthlyRevenueUsdCents: 60_000,
            subscribers: 1_000,
            isMonetized: true,
            audienceTopCountry: null,
        });

        expect(s.toJSON().assetData.audienceTopCountry).toBe('AR');
    });
});

describe('YouTubeStrategy: valuación según el país', () => {
    // ingreso mensual 600 USD, crecimiento neutro: precio = ingreso * múltiplo.
    const priceOf = (s: YouTubeStrategy) => s.calculateEstimatedPrice().getCents();

    it('sin país de Google el delta de audiencia es neutro: múltiplo 24', () => {
        expect(priceOf(verified())).toBe(60_000 * 24);
    });

    it('un activo manual sin país sigue restando 3: múltiplo 21', () => {
        expect(priceOf(manual())).toBe(60_000 * 21);
    });

    it('un activo verificado con audiencia de CPM alto suma 4: múltiplo 28', () => {
        expect(priceOf(verified({ country: 'US' }))).toBe(60_000 * 28);
    });

    it('un activo verificado con otro país resta 3: múltiplo 21', () => {
        expect(priceOf(verified({ country: 'AR' }))).toBe(60_000 * 21);
    });
});

describe('YouTubeStrategy: fecha de verificación en el descriptor', () => {
    it('se declara como fecha, no como texto, para que la vista la formatee', () => {
        const field = verified().describe().fields.find((f) => f.key === 'verifiedFromYouTubeAt');

        expect(field?.kind).toBe('date');
    });
});
