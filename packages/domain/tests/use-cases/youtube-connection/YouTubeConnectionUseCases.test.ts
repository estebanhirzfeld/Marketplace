import { describe, it, expect, vi } from 'vitest';
import { UserRole, AssetType } from '@marketplace/shared-types';
import { ConnectYouTubeChannelUseCase } from '../../../src/use-cases/youtube-connection/ConnectYouTubeChannelUseCase';
import { ListYouTubeConnectionsUseCase } from '../../../src/use-cases/youtube-connection/ListYouTubeConnectionsUseCase';
import { CreateListingFromYouTubeConnectionUseCase } from '../../../src/use-cases/youtube-connection/CreateListingFromYouTubeConnectionUseCase';
import { IListingRepository, IYouTubeConnectionRepository } from '../../../src/ports/Repositories';
import { IYouTubeChannelListingFinder } from '../../../src/ports/IYouTubeChannelListingFinder';
import { IYouTubeAnalyticsReader } from '../../../src/ports/IYouTubeAnalyticsReader';
import {
    IYouTubeConnectionOAuthClient,
    YouTubeConnectionTokens,
} from '../../../src/ports/IYouTubeConnectionOAuthClient';
import { ISecretCipher } from '../../../src/ports/ISecretCipher';
import { Actor } from '../../../src/ports/Actor';
import { YouTubeConnection } from '../../../src/entities/YouTubeConnection';
import { Listing, ListingStatus } from '../../../src/entities/Listing';
import { YouTubeChannelAnalytics } from '../../../src/value-objects/YouTubeChannelAnalytics';
import { REQUIRED_YOUTUBE_SCOPES, MissingYouTubeScopesError } from '../../../src/value-objects/YouTubeScopes';
import { YouTubeStrategy } from '../../../src/strategies/YouTubeStrategy';
import { Money } from '../../../src/value-objects/Money';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import {
    ChannelAlreadyListedError,
    ForbiddenError,
    InvalidStateError,
    NotFoundError,
    ServiceUnavailableError,
    ValidationError,
} from '../../../src/errors/DomainError';

// ── Fakes ────────────────────────────────────────────────

const NOW = new Date('2026-10-09T12:00:00.000Z');
const CHANNEL_ID = 'UCq-Fj5jknLsUf-MWSy4_brA';
const PLAIN_REFRESH_TOKEN = 'refresh-token-en-claro';

const SELLER: Actor = { id: new UniqueEntityID().toString(), role: UserRole.SELLER };
const OTHER_SELLER: Actor = { id: new UniqueEntityID().toString(), role: UserRole.SELLER };
const ADMIN: Actor = { id: new UniqueEntityID().toString(), role: UserRole.ADMIN };

const cipher: ISecretCipher = {
    encrypt: (plain) => `enc:${plain.split('').reverse().join('')}`,
    decrypt: (payload) => payload.slice(4).split('').reverse().join(''),
};

function buildReading(overrides: { revenue12MonthsCents?: number; monthlyRevenue?: number; subscribers?: number } = {}) {
    const monthRevenue = overrides.monthlyRevenue ?? 60_000;
    return YouTubeChannelAnalytics.create({
        channelId: CHANNEL_ID,
        title: 'Canal de prueba',
        thumbnailUrl: 'https://yt3.example/foto.jpg',
        subscribers: overrides.subscribers ?? 12_000,
        views12Months: 480_000,
        revenue12MonthsCents: overrides.revenue12MonthsCents ?? monthRevenue * 12,
        monthly: ['2026-07', '2026-08', '2026-09'].map((month) => ({
            month,
            views: 40_000,
            subscribersGained: 300,
            subscribersLost: 20,
            revenueCents: monthRevenue,
        })),
        topCountry: 'US',
        periodStart: new Date('2025-10-01T00:00:00Z'),
        periodEnd: new Date('2026-10-08T00:00:00Z'),
        readAt: NOW,
    });
}

function tokens(overrides: Partial<YouTubeConnectionTokens> = {}): YouTubeConnectionTokens {
    return {
        accessToken: 'access-token',
        refreshToken: PLAIN_REFRESH_TOKEN,
        grantedScopes: [...REQUIRED_YOUTUBE_SCOPES],
        ...overrides,
    };
}

function fakeOAuth(result: YouTubeConnectionTokens | Error): IYouTubeConnectionOAuthClient {
    return {
        authorizationUrl: vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?x=1'),
        exchangeCode: vi.fn(async () => {
            if (result instanceof Error) throw result;
            return result;
        }),
    };
}

function fakeReader(result: YouTubeChannelAnalytics | null | Error): IYouTubeAnalyticsReader {
    return {
        read: vi.fn(async () => {
            if (result instanceof Error) throw result;
            return result;
        }),
    };
}

function fakeConnections(initial: YouTubeConnection[] = []) {
    const rows = new Map<string, YouTubeConnection>(
        initial.map((c) => [`${c.sellerId.toString()}|${c.channelId}`, c]),
    );
    const repo: IYouTubeConnectionRepository = {
        findBySellerAndChannel: vi.fn(async (sellerId: string, channelId: string) => rows.get(`${sellerId}|${channelId}`) ?? null),
        findBySeller: vi.fn(async (sellerId: string) => [...rows.values()].filter((c) => c.sellerId.toString() === sellerId)),
        save: vi.fn(async (c: YouTubeConnection) => {
            rows.set(`${c.sellerId.toString()}|${c.channelId}`, c);
        }),
    };
    return { repo, rows };
}

function fakeListingRepo(): IListingRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findPublished: vi.fn().mockResolvedValue([]),
        findBySeller: vi.fn().mockResolvedValue([]),
        findByStatus: vi.fn().mockResolvedValue([]),
        findHeldBy: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    };
}

function fakeFinder(existing: Listing[] = []): IYouTubeChannelListingFinder {
    return { findByChannelId: vi.fn().mockResolvedValue(existing) };
}

function connectionOf(actor: Actor, overrides: { disconnected?: boolean } = {}): YouTubeConnection {
    const c = YouTubeConnection.create({
        sellerId: new UniqueEntityID(actor.id),
        channelId: CHANNEL_ID,
        channelTitle: 'Canal de prueba',
        grantedScopes: [...REQUIRED_YOUTUBE_SCOPES],
        encryptedRefreshToken: cipher.encrypt(PLAIN_REFRESH_TOKEN),
        connectedAt: NOW,
        lastSnapshot: buildReading(),
    });
    if (overrides.disconnected) c.disconnect();
    return c;
}

function existingListing(status: ListingStatus, seller: Actor = OTHER_SELLER): Listing {
    return Listing.reconstitute(
        {
            sellerId: new UniqueEntityID(seller.id),
            assetStrategy: new YouTubeStrategy({
                monthlyRevenueUsd: Money.fromCents(0, 'USD'),
                subscribers: 1,
                isMonetized: false,
                channelUrl: `https://www.youtube.com/channel/${CHANNEL_ID}`,
            }),
            status,
            askingPrice: Money.fromCents(100_000, 'USD'),
        },
        new UniqueEntityID(),
        NOW,
    );
}

// ═════════════════════════════════════════════════════════

describe('ConnectYouTubeChannelUseCase', () => {
    function setup(opts: {
        oauth?: IYouTubeConnectionOAuthClient;
        reader?: IYouTubeAnalyticsReader;
        initial?: YouTubeConnection[];
    } = {}) {
        const connectionStore = fakeConnections(opts.initial);
        const oauth = opts.oauth ?? fakeOAuth(tokens());
        const reader = opts.reader ?? fakeReader(buildReading());
        const useCase = new ConnectYouTubeChannelUseCase(connectionStore.repo, oauth, reader, cipher, () => NOW);
        return { useCase, oauth, reader, ...connectionStore };
    }

    it.each(REQUIRED_YOUTUBE_SCOPES.map((s) => [s]))(
        'si falta el permiso %s, rechaza, nombra lo que falta y no guarda nada',
        async (missingScope) => {
            const granted = REQUIRED_YOUTUBE_SCOPES.filter((s) => s !== missingScope);
            const { useCase, repo, reader } = setup({ oauth: fakeOAuth(tokens({ grantedScopes: granted })) });

            const error = await useCase.execute({ code: 'c' }, SELLER).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(MissingYouTubeScopesError);
            expect(error).toBeInstanceOf(ValidationError);
            expect((error as MissingYouTubeScopesError).missing).toEqual([missingScope]);
            expect(repo.save).not.toHaveBeenCalled();
            expect(reader.read).not.toHaveBeenCalled();
        },
    );

    it('el mensaje nombra lo que falta en lenguaje del vendedor', async () => {
        const { useCase } = setup({ oauth: fakeOAuth(tokens({ grantedScopes: [] })) });

        await expect(useCase.execute({ code: 'c' }, SELLER)).rejects.toThrow(
            /ver tu canal.*las estadísticas.*las estadísticas de ingresos/s,
        );
    });

    it('si la cuenta no tiene canal, falla con un mensaje claro y no guarda', async () => {
        const { useCase, repo } = setup({ reader: fakeReader(null) });

        await expect(useCase.execute({ code: 'c' }, SELLER)).rejects.toThrow(
            /Esa cuenta de Google no tiene un canal/,
        );
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('guarda el token cifrado (nunca en claro) y los permisos otorgados', async () => {
        const { useCase, rows } = setup();

        await useCase.execute({ code: 'c' }, SELLER);

        const saved = rows.get(`${SELLER.id}|${CHANNEL_ID}`)!;
        expect(saved.encryptedRefreshToken).toBe(cipher.encrypt(PLAIN_REFRESH_TOKEN));
        expect(saved.encryptedRefreshToken).not.toContain(PLAIN_REFRESH_TOKEN);
        expect(JSON.stringify(saved.toSnapshot().props)).not.toContain(PLAIN_REFRESH_TOKEN);
        expect(saved.grantedScopes).toEqual([...REQUIRED_YOUTUBE_SCOPES]);
        expect(saved.isActive()).toBe(true);
        expect(saved.lastReadAt).toEqual(NOW);
    });

    it('lee el canal con el token de acceso', async () => {
        const { useCase, reader } = setup();

        await useCase.execute({ code: 'c' }, SELLER);

        expect(reader.read).toHaveBeenCalledWith('access-token');
    });

    it('devuelve un resumen con el ingreso mensual y si está monetizado', async () => {
        const { useCase } = setup();

        const summary = await useCase.execute({ code: 'c' }, SELLER);

        expect(summary).toMatchObject({
            channelId: CHANNEL_ID,
            channelTitle: 'Canal de prueba',
            subscribers: 12_000,
            monthlyRevenueCents: 60_000,
            isMonetized: true,
            topCountry: 'US',
        });
        expect(JSON.stringify(summary)).not.toContain(PLAIN_REFRESH_TOKEN);
    });

    it('un canal sin ingresos se resume como no monetizado', async () => {
        const { useCase } = setup({ reader: fakeReader(buildReading({ revenue12MonthsCents: 0, monthlyRevenue: 0 })) });

        const summary = await useCase.execute({ code: 'c' }, SELLER);

        expect(summary.isMonetized).toBe(false);
        expect(summary.monthlyRevenueCents).toBe(0);
    });

    it('conectar de nuevo el mismo canal actualiza la conexión en vez de duplicarla', async () => {
        const previous = connectionOf(SELLER, { disconnected: true });
        const { useCase, rows } = setup({ initial: [previous] });

        await useCase.execute({ code: 'c' }, SELLER);

        expect(rows.size).toBe(1);
        const current = rows.get(`${SELLER.id}|${CHANNEL_ID}`)!;
        expect(current.id.toString()).toBe(previous.id.toString());
        expect(current.isActive()).toBe(true);
    });

    it('si Google no entrega token de actualización, rechaza sin guardar', async () => {
        const { useCase, repo } = setup({ oauth: fakeOAuth(tokens({ refreshToken: undefined })) });

        await expect(useCase.execute({ code: 'c' }, SELLER)).rejects.toThrow(ValidationError);
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('si Google rechaza el código (inválido o vencido), es un error de validación y no guarda', async () => {
        const { useCase, repo } = setup({ oauth: fakeOAuth(new Error('invalid_grant: code=SECRETO')) });

        const error = await useCase.execute({ code: 'c' }, SELLER).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ValidationError);
        expect((error as Error).message).not.toContain('SECRETO');
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('si Google no está disponible al canjear el código, no culpa al vendedor y no guarda', async () => {
        const { useCase, repo, reader } = setup({
            oauth: fakeOAuth(new ServiceUnavailableError('Google respondió 503 con code=SECRETO')),
        });

        const error = await useCase.execute({ code: 'c' }, SELLER).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ServiceUnavailableError);
        expect(error).not.toBeInstanceOf(ValidationError);
        expect((error as Error).message).toBe(
            'No pudimos leer tu canal. No se guardó nada; probá de nuevo en unos minutos.',
        );
        expect(reader.read).not.toHaveBeenCalled();
        expect(repo.save).not.toHaveBeenCalled();
    });

    it.each([
        ['una falla transitoria', new ServiceUnavailableError('cuota agotada secreto')],
        ['una falla inesperada', new Error('503 secreto')],
    ])('si Google falla al leer el canal (%s), responde no disponible y no guarda', async (_label, failure) => {
        const { useCase, repo } = setup({ reader: fakeReader(failure) });

        const error = await useCase.execute({ code: 'c' }, SELLER).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ServiceUnavailableError);
        expect((error as Error).message).toBe(
            'No pudimos leer tu canal. No se guardó nada; probá de nuevo en unos minutos.',
        );
        expect((error as Error).message).not.toContain('secreto');
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('un administrador no conecta canales', async () => {
        const { useCase, oauth } = setup();

        await expect(useCase.execute({ code: 'c' }, ADMIN)).rejects.toThrow(ForbiddenError);
        expect(oauth.exchangeCode).not.toHaveBeenCalled();
    });
});

describe('CreateListingFromYouTubeConnectionUseCase', () => {
    function setup(opts: { initial?: YouTubeConnection[]; existing?: Listing[] } = {}) {
        const connectionStore = fakeConnections(opts.initial);
        const listings = fakeListingRepo();
        const finder = fakeFinder(opts.existing);
        const useCase = new CreateListingFromYouTubeConnectionUseCase(connectionStore.repo, listings, finder);
        return { useCase, listings, finder };
    }

    const input = {
        channelId: CHANNEL_ID,
        niche: 'gaming',
        hasNoFaceContent: true,
        askingPriceCents: 1_500_000,
        currency: 'USD' as const,
    };

    it('crea el activo en borrador con los datos verificados de la conexión', async () => {
        const { useCase, listings } = setup({ initial: [connectionOf(SELLER)] });

        const { listingId } = await useCase.execute(input, SELLER);

        const saved = vi.mocked(listings.save).mock.calls[0][0];
        expect(saved.id.toString()).toBe(listingId);
        expect(saved.status).toBe('draft');
        expect(saved.sellerId.toString()).toBe(SELLER.id);
        expect(saved.askingPrice.getCents()).toBe(1_500_000);

        const { assetType, assetData } = saved.assetDataFor(true);
        expect(assetType).toBe(AssetType.YOUTUBE);
        expect(assetData).toMatchObject({
            subscribers: 12_000,
            monthlyRevenueUsdCents: 60_000,
            isMonetized: true,
            audienceTopCountry: 'US',
            // Neutro de verdad: 1.0 no mueve el múltiplo de la valuación.
            growthFactor: 1,
            hasNoFaceContent: true,
            niche: 'gaming',
            name: 'Canal de prueba',
            channelUrl: `https://www.youtube.com/channel/${CHANNEL_ID}`,
            verifiedFromYouTubeAt: NOW.toISOString(),
        });
    });

    it('registra la verificación de titularidad con fuente youtube', async () => {
        const { useCase, listings } = setup({ initial: [connectionOf(SELLER)] });

        await useCase.execute(input, SELLER);

        const saved = vi.mocked(listings.save).mock.calls[0][0];
        expect(saved.isOwnershipVerified()).toBe(true);
        expect(saved.ownershipVerification).toMatchObject({ source: 'youtube', assetId: CHANNEL_ID });
        expect(saved.ownershipVerification!.verifiedBy.toString()).toBe(SELLER.id);
    });

    it('la valuación usa el ingreso verificado', async () => {
        const { useCase, listings } = setup({ initial: [connectionOf(SELLER)] });

        await useCase.execute(input, SELLER);

        const saved = vi.mocked(listings.save).mock.calls[0][0];
        const expected = new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(60_000, 'USD'),
            subscribers: 12_000,
            isMonetized: true,
            audienceTopCountry: 'US',
            hasNoFaceContent: true,
        }).calculateEstimatedPrice();
        expect(saved.estimatedPrice.getCents()).toBe(expected.getCents());
    });

    it('sin ingresos valúa por alcance (calculateByReach): suscriptores por 1 dólar', async () => {
        const withoutRevenue = YouTubeConnection.create({
            sellerId: new UniqueEntityID(SELLER.id),
            channelId: CHANNEL_ID,
            channelTitle: 'Canal de prueba',
            grantedScopes: [...REQUIRED_YOUTUBE_SCOPES],
            encryptedRefreshToken: cipher.encrypt(PLAIN_REFRESH_TOKEN),
            connectedAt: NOW,
            lastSnapshot: buildReading({ revenue12MonthsCents: 0, monthlyRevenue: 0, subscribers: 5_000 }),
        });
        const { useCase, listings } = setup({ initial: [withoutRevenue] });

        const { estimatedPriceCents } = await useCase.execute(input, SELLER);

        const saved = vi.mocked(listings.save).mock.calls[0][0];
        expect(saved.assetDataFor(true).assetData.isMonetized).toBe(false);
        expect(saved.estimatedPrice.getCents()).toBe(5_000 * 100);
        expect(estimatedPriceCents).toBe(5_000 * 100);
    });

    it('rechaza una conexión ajena sin guardar nada', async () => {
        const { useCase, listings } = setup({ initial: [connectionOf(OTHER_SELLER)] });

        await expect(useCase.execute(input, SELLER)).rejects.toThrow(NotFoundError);
        expect(listings.save).not.toHaveBeenCalled();
    });

    it('rechaza una conexión desconectada', async () => {
        const { useCase, listings } = setup({ initial: [connectionOf(SELLER, { disconnected: true })] });

        await expect(useCase.execute(input, SELLER)).rejects.toThrow(InvalidStateError);
        expect(listings.save).not.toHaveBeenCalled();
    });

    it.each<ListingStatus>(['draft', 'under_review', 'published', 'in_operation'])(
        'rechaza un canal que ya tiene un activo %s',
        async (status) => {
            const existing = existingListing(status, SELLER);
            const { useCase, listings, finder } = setup({ initial: [connectionOf(SELLER)], existing: [existing] });

            const error = await useCase.execute(input, SELLER).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(ChannelAlreadyListedError);
            expect(error).toBeInstanceOf(InvalidStateError);
            expect((error as ChannelAlreadyListedError).listingId).toBe(existing.id.toString());
            expect((error as ChannelAlreadyListedError).ownedByRequester).toBe(true);
            expect(finder.findByChannelId).toHaveBeenCalledWith(CHANNEL_ID);
            expect(listings.save).not.toHaveBeenCalled();
        },
    );

    it('no revela el activo de otro vendedor', async () => {
        const foreign = existingListing('published', OTHER_SELLER);
        const { useCase } = setup({ initial: [connectionOf(SELLER)], existing: [foreign] });

        const error = await useCase.execute(input, SELLER).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ChannelAlreadyListedError);
        expect((error as ChannelAlreadyListedError).ownedByRequester).toBe(false);
        expect((error as ChannelAlreadyListedError).listingId).toBeUndefined();
    });

    it.each<ListingStatus>(['rejected', 'sold'])('un activo %s no impide publicar de nuevo', async (status) => {
        const { useCase, listings } = setup({
            initial: [connectionOf(SELLER)],
            existing: [existingListing(status, SELLER)],
        });

        await useCase.execute(input, SELLER);

        expect(listings.save).toHaveBeenCalledTimes(1);
    });

    it('rechaza un rubro inválido, un precio no positivo y un administrador', async () => {
        const { useCase, listings } = setup({ initial: [connectionOf(SELLER)] });

        await expect(useCase.execute({ ...input, niche: 'inventado' }, SELLER)).rejects.toThrow(ValidationError);
        await expect(useCase.execute({ ...input, askingPriceCents: 0 }, SELLER)).rejects.toThrow(ValidationError);
        await expect(useCase.execute(input, ADMIN)).rejects.toThrow(ForbiddenError);
        expect(listings.save).not.toHaveBeenCalled();
    });
});

describe('ListYouTubeConnectionsUseCase', () => {
    it('lista los resúmenes de las conexiones activas del vendedor, sin tokens ni las de otros', async () => {
        const mine = connectionOf(SELLER);
        const store = fakeConnections([mine, connectionOf(OTHER_SELLER)]);
        const useCase = new ListYouTubeConnectionsUseCase(store.repo);

        const summaries = await useCase.execute(SELLER);

        expect(summaries).toHaveLength(1);
        expect(summaries[0]).toMatchObject({
            connectionId: mine.id.toString(),
            channelId: CHANNEL_ID,
            monthlyRevenueCents: 60_000,
        });
        expect(JSON.stringify(summaries)).not.toContain(PLAIN_REFRESH_TOKEN);
        expect(JSON.stringify(summaries)).not.toContain(cipher.encrypt(PLAIN_REFRESH_TOKEN));
    });

    it('omite las conexiones desconectadas', async () => {
        const store = fakeConnections([connectionOf(SELLER, { disconnected: true })]);

        await expect(new ListYouTubeConnectionsUseCase(store.repo).execute(SELLER)).resolves.toEqual([]);
    });

    it('un administrador no tiene conexiones', async () => {
        const store = fakeConnections();

        await expect(new ListYouTubeConnectionsUseCase(store.repo).execute(ADMIN)).rejects.toThrow(ForbiddenError);
    });
});
