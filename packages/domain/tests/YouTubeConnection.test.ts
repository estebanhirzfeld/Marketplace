import { describe, it, expect } from 'vitest';
import {
    REQUIRED_YOUTUBE_SCOPES,
    YOUTUBE_SCOPE,
    missingYouTubeScopes,
} from '../src/value-objects/YouTubeScopes';
import {
    YouTubeChannelAnalytics,
    YouTubeChannelAnalyticsProps,
} from '../src/value-objects/YouTubeChannelAnalytics';
import { YouTubeConnection } from '../src/entities/YouTubeConnection';
import { YouTubeStrategy } from '../src/strategies/YouTubeStrategy';
import { createAssetStrategy } from '../src/strategies/AssetStrategyFactory';
import { Money } from '../src/value-objects/Money';
import { UniqueEntityID } from '../src/value-objects/UniqueEntityID';
import { ValidationError } from '../src/errors/DomainError';
import { AssetType } from '@marketplace/shared-types';

const READ_AT = new Date('2026-10-09T12:00:00Z');

function readingProps(overrides: Partial<YouTubeChannelAnalyticsProps> = {}): YouTubeChannelAnalyticsProps {
    return {
        channelId: 'UCq-Fj5jknLsUf-MWSy4_brA',
        title: 'Canal de prueba',
        subscribers: 12_000,
        views12Months: 480_000,
        revenue12MonthsCents: 360_000,
        monthly: [
            { month: '2026-06', views: 30_000, subscribersGained: 300, subscribersLost: 20, revenueCents: 20_000 },
            { month: '2026-07', views: 40_000, subscribersGained: 400, subscribersLost: 30, revenueCents: 30_000 },
            { month: '2026-08', views: 45_000, subscribersGained: 350, subscribersLost: 25, revenueCents: 60_000 },
            { month: '2026-09', views: 50_000, subscribersGained: 500, subscribersLost: 40, revenueCents: 90_000 },
            // Mes en curso: incompleto, no puede entrar en el promedio.
            { month: '2026-10', views: 5_000, subscribersGained: 50, subscribersLost: 2, revenueCents: 999_999 },
        ],
        periodStart: new Date('2025-10-01T00:00:00Z'),
        periodEnd: new Date('2026-10-08T00:00:00Z'),
        readAt: READ_AT,
        ...overrides,
    };
}

describe('Permisos obligatorios de YouTube', () => {
    it('son exactamente los tres permisos de lectura', () => {
        expect([...REQUIRED_YOUTUBE_SCOPES].sort()).toEqual(
            [
                'https://www.googleapis.com/auth/youtube.readonly',
                'https://www.googleapis.com/auth/yt-analytics.readonly',
                'https://www.googleapis.com/auth/yt-analytics-monetary.readonly',
            ].sort(),
        );
    });

    it('sin faltantes cuando se otorgaron todos', () => {
        expect(missingYouTubeScopes([...REQUIRED_YOUTUBE_SCOPES])).toEqual([]);
    });

    it.each(REQUIRED_YOUTUBE_SCOPES.map((s) => [s]))('informa %s cuando es el único que falta', (missingScope) => {
        const granted = REQUIRED_YOUTUBE_SCOPES.filter((s) => s !== missingScope);

        expect(missingYouTubeScopes(granted)).toEqual([missingScope]);
    });

    it('informa los tres cuando no se otorgó ninguno, y tolera permisos de más', () => {
        expect(missingYouTubeScopes(['openid', 'email'])).toEqual([...REQUIRED_YOUTUBE_SCOPES]);
    });

    it('expone los permisos por nombre', () => {
        expect(REQUIRED_YOUTUBE_SCOPES).toContain(YOUTUBE_SCOPE.CHANNEL);
        expect(REQUIRED_YOUTUBE_SCOPES).toContain(YOUTUBE_SCOPE.ANALYTICS);
        expect(REQUIRED_YOUTUBE_SCOPES).toContain(YOUTUBE_SCOPE.REVENUE);
    });
});

describe('YouTubeChannelAnalytics', () => {
    it('el ingreso mensual es el promedio de los últimos 3 meses completos', () => {
        const reading = YouTubeChannelAnalytics.create(readingProps());

        // (30.000 + 60.000 + 90.000) / 3; el mes en curso no cuenta.
        expect(reading.monthlyRevenueCents()).toBe(60_000);
    });

    it('redondea el promedio a centavos enteros', () => {
        const reading = YouTubeChannelAnalytics.create(
            readingProps({
                monthly: [
                    { month: '2026-07', views: 1, subscribersGained: 0, subscribersLost: 0, revenueCents: 1 },
                    { month: '2026-08', views: 1, subscribersGained: 0, subscribersLost: 0, revenueCents: 1 },
                    { month: '2026-09', views: 1, subscribersGained: 0, subscribersLost: 0, revenueCents: 2 },
                ],
            }),
        );

        expect(Number.isInteger(reading.monthlyRevenueCents())).toBe(true);
        expect(reading.monthlyRevenueCents()).toBe(1);
    });

    it('con menos de 3 meses completos promedia los que hay; sin ninguno, cero', () => {
        const oneMonth = YouTubeChannelAnalytics.create(
            readingProps({
                monthly: [
                    { month: '2026-09', views: 1, subscribersGained: 0, subscribersLost: 0, revenueCents: 9_000 },
                ],
            }),
        );
        const none = YouTubeChannelAnalytics.create(readingProps({ monthly: [] }));

        expect(oneMonth.monthlyRevenueCents()).toBe(9_000);
        expect(none.monthlyRevenueCents()).toBe(0);
    });

    it('ordena la serie sin depender del orden en que llega', () => {
        const props = readingProps();
        const reading = YouTubeChannelAnalytics.create({ ...props, monthly: [...props.monthly].reverse() });

        expect(reading.monthlyRevenueCents()).toBe(60_000);
    });

    it('está monetizado cuando los ingresos de 12 meses son mayores que cero', () => {
        expect(YouTubeChannelAnalytics.create(readingProps()).isMonetized()).toBe(true);
        expect(
            YouTubeChannelAnalytics.create(readingProps({ revenue12MonthsCents: 0 })).isMonetized(),
        ).toBe(false);
    });

    it('rechaza dinero que no esté en centavos enteros', () => {
        expect(() =>
            YouTubeChannelAnalytics.create(readingProps({ revenue12MonthsCents: 10.5 })),
        ).toThrow(ValidationError);
    });

    it('rechaza un mes con formato inválido', () => {
        const props = readingProps();
        expect(() =>
            YouTubeChannelAnalytics.create({
                ...props,
                monthly: [{ month: '09/2026', views: 1, subscribersGained: 0, subscribersLost: 0, revenueCents: 1 }],
            }),
        ).toThrow(ValidationError);
    });

    it('rechaza un canal sin identificador', () => {
        expect(() => YouTubeChannelAnalytics.create(readingProps({ channelId: ' ' }))).toThrow(ValidationError);
    });
});

describe('YouTubeConnection', () => {
    function data() {
        return {
            sellerId: new UniqueEntityID(),
            channelId: 'UCq-Fj5jknLsUf-MWSy4_brA',
            channelTitle: 'Canal de prueba',
            grantedScopes: [...REQUIRED_YOUTUBE_SCOPES],
            encryptedRefreshToken: 'enc:refresco',
            connectedAt: READ_AT,
            lastSnapshot: YouTubeChannelAnalytics.create(readingProps()),
        };
    }

    it('nace activa y con la fecha de lectura del snapshot', () => {
        const connection = YouTubeConnection.create(data());

        expect(connection.status).toBe('active');
        expect(connection.isActive()).toBe(true);
        expect(connection.lastReadAt).toEqual(READ_AT);
    });

    it('exige el token de actualización cifrado', () => {
        expect(() => YouTubeConnection.create({ ...data(), encryptedRefreshToken: '' })).toThrow(ValidationError);
    });

    it('no admite una conexión creada sin los tres permisos', () => {
        expect(() =>
            YouTubeConnection.create({ ...data(), grantedScopes: [YOUTUBE_SCOPE.CHANNEL] }),
        ).toThrow(ValidationError);
    });

    it('se desconecta y se reconecta con token nuevo', () => {
        const connection = YouTubeConnection.create(data());
        const later = new Date('2026-10-10T12:00:00Z');

        connection.disconnect();
        expect(connection.isActive()).toBe(false);

        const newReading = YouTubeChannelAnalytics.create(readingProps({ readAt: later, subscribers: 13_000 }));
        connection.reconnect({
            grantedScopes: [...REQUIRED_YOUTUBE_SCOPES],
            encryptedRefreshToken: 'enc:otro',
            snapshot: newReading,
        });

        expect(connection.isActive()).toBe(true);
        expect(connection.encryptedRefreshToken).toBe('enc:otro');
        expect(connection.lastReadAt).toEqual(later);
        expect(connection.lastSnapshot.subscribers).toBe(13_000);
    });

    it('no admite crear la conexión con el snapshot de otro canal', () => {
        const otherChannel = YouTubeChannelAnalytics.create(readingProps({ channelId: 'UCotro-canal' }));

        expect(() => YouTubeConnection.create({ ...data(), lastSnapshot: otherChannel })).toThrow(
            /otro canal/,
        );
    });

    describe('reconnect rechaza datos inválidos sin tocar el estado', () => {
        function disconnectedConnection() {
            const connection = YouTubeConnection.create(data());
            connection.disconnect();
            return connection;
        }

        function expectUntouched(connection: YouTubeConnection) {
            expect(connection.status).toBe('disconnected');
            expect(connection.encryptedRefreshToken).toBe('enc:refresco');
            expect(connection.grantedScopes).toEqual([...REQUIRED_YOUTUBE_SCOPES]);
            expect(connection.lastSnapshot.subscribers).toBe(12_000);
            expect(connection.lastReadAt).toEqual(READ_AT);
            expect(connection.channelTitle).toBe('Canal de prueba');
        }

        const newReading = () =>
            YouTubeChannelAnalytics.create(
                readingProps({ readAt: new Date('2026-10-10T12:00:00Z'), subscribers: 13_000, title: 'Otro nombre' }),
            );

        it('con el token vacío', () => {
            const connection = disconnectedConnection();

            expect(() =>
                connection.reconnect({
                    grantedScopes: [...REQUIRED_YOUTUBE_SCOPES],
                    encryptedRefreshToken: '  ',
                    snapshot: newReading(),
                }),
            ).toThrow(ValidationError);
            expectUntouched(connection);
        });

        it('con permisos faltantes', () => {
            const connection = disconnectedConnection();

            expect(() =>
                connection.reconnect({
                    grantedScopes: [YOUTUBE_SCOPE.CHANNEL],
                    encryptedRefreshToken: 'enc:otro',
                    snapshot: newReading(),
                }),
            ).toThrow(ValidationError);
            expectUntouched(connection);
        });

        it('con la lectura de otro canal', () => {
            const connection = disconnectedConnection();
            const otherChannel = YouTubeChannelAnalytics.create(
                readingProps({ channelId: 'UCotro-canal', subscribers: 13_000 }),
            );

            expect(() =>
                connection.reconnect({
                    grantedScopes: [...REQUIRED_YOUTUBE_SCOPES],
                    encryptedRefreshToken: 'enc:otro',
                    snapshot: otherChannel,
                }),
            ).toThrow(/otro canal/);
            expectUntouched(connection);
        });
    });

    it('reconstitute no completa ni valida nada', () => {
        const connection = YouTubeConnection.reconstitute(
            { ...data(), status: 'disconnected', lastReadAt: READ_AT },
            new UniqueEntityID(),
            READ_AT,
        );

        expect(connection.status).toBe('disconnected');
    });
});

describe('YouTubeStrategy con datos verificados por YouTube', () => {
    const verified = () =>
        new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(60_000, 'USD'),
            subscribers: 12_000,
            isMonetized: true,
            channelUrl: 'https://www.youtube.com/channel/UCq-Fj5jknLsUf-MWSy4_brA',
            name: 'Canal de prueba',
            verifiedFromYouTubeAt: READ_AT,
        });

    it('guarda la marca de origen verificado con su fecha', () => {
        expect(verified().toJSON().assetData.verifiedFromYouTubeAt).toBe(READ_AT.toISOString());
    });

    it('un activo cargado a mano no lleva la marca', () => {
        const manual = new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(60_000, 'USD'),
            subscribers: 12_000,
            isMonetized: true,
        });

        expect(manual.toJSON().assetData).not.toHaveProperty('verifiedFromYouTubeAt');
    });

    it('clasifica la marca: ni sin clasificar ni en ambas listas', () => {
        const s = verified();
        const keys = Object.keys(s.toJSON().assetData);
        const classified = [...s.getPublicFields(), ...s.getConfidentialFields()];

        expect(keys.filter((c) => !classified.includes(c))).toEqual([]);
        expect(s.getPublicFields().filter((c) => s.getConfidentialFields().includes(c))).toEqual([]);
        expect(s.getPublicFields()).toContain('verifiedFromYouTubeAt');
    });

    it('el descriptor describe exactamente los campos que emite', () => {
        const s = verified();

        expect(s.describe().fields.map((f) => f.key).sort()).toEqual(Object.keys(s.toJSON().assetData).sort());
    });

    it('se rehidrata desde assetData conservando la marca', () => {
        const original = verified().toJSON();
        const rehydrated = createAssetStrategy(AssetType.YOUTUBE, original.assetData);

        expect(rehydrated.toJSON()).toEqual(original);
    });
});
