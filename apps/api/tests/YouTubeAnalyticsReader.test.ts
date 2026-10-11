import { describe, it, expect, vi } from 'vitest';
import { YouTubeAnalyticsReader } from '../src/adapters/YouTubeAnalyticsReader';
import { ServiceUnavailableError, YouTubeAuthorizationRevokedError } from '@marketplace/domain/src/errors/DomainError';

/**
 * El lector de YouTube Analytics contra respuestas fabricadas, con `fetch`
 * inyectado: ningún test sale a la red. Se fija el reloj para que las fechas
 * del reporte sean deterministas.
 *
 * La regla que más cuesta olvidar: con `dimensions=month`, `startDate` y
 * `endDate` tienen que ser AMBAS el día 1 de un mes.
 */

const NOW = new Date('2026-10-09T15:30:00.000Z');
const TOKEN = 'ya29.acceso-secreto';

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const CHANNEL_RESPONSE = {
    items: [
        {
            id: 'UCq-Fj5jknLsUf-MWSy4_brA',
            snippet: {
                title: 'Canal de prueba',
                thumbnails: { default: { url: 'https://yt3.example/foto.jpg' } },
            },
            statistics: { subscriberCount: '12345', hiddenSubscriberCount: false },
        },
    ],
};

const MONTH_HEADERS = [
    { name: 'month' },
    { name: 'views' },
    { name: 'subscribersGained' },
    { name: 'subscribersLost' },
    { name: 'estimatedRevenue' },
];

function monthReport(rows: Array<[string, number, number, number, number]>) {
    return { columnHeaders: MONTH_HEADERS, rows };
}

const COUNTRY_REPORT = { columnHeaders: [{ name: 'country' }, { name: 'views' }], rows: [['US', 300_000]] };

/** Responde según el endpoint pedido. */
function route(handlers: {
    channels?: () => Response;
    month?: () => Response;
    country?: () => Response;
}) {
    return vi.fn<Parameters<typeof fetch>, Promise<Response>>(async (input) => {
        const url = new URL(String(input));
        if (url.pathname === '/youtube/v3/channels') return (handlers.channels ?? (() => json(CHANNEL_RESPONSE)))();
        if (url.searchParams.get('dimensions') === 'month') {
            return (handlers.month ?? (() => json(monthReport([]))))();
        }
        if (url.searchParams.get('dimensions') === 'country') {
            return (handlers.country ?? (() => json(COUNTRY_REPORT)))();
        }
        throw new Error(`Pedido inesperado: ${url.toString()}`);
    });
}

function build(fetchImpl: typeof fetch) {
    return new YouTubeAnalyticsReader(fetchImpl, () => NOW);
}

function callsTo(fetchImpl: ReturnType<typeof route>, dimension: string) {
    return fetchImpl.mock.calls
        .map(([input, init]) => ({ url: new URL(String(input)), init }))
        .filter((c) => c.url.searchParams.get('dimensions') === dimension);
}

describe('YouTubeAnalyticsReader — canal', () => {
    it('consulta el canal propio con el token de acceso', async () => {
        const fetchImpl = route({});

        await build(fetchImpl).read(TOKEN);

        const [input, init] = fetchImpl.mock.calls[0];
        const url = new URL(String(input));
        expect(url.origin + url.pathname).toBe('https://www.googleapis.com/youtube/v3/channels');
        expect(url.searchParams.get('part')).toBe('snippet,statistics');
        expect(url.searchParams.get('mine')).toBe('true');
        expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`);
    });

    it('una cuenta sin canal devuelve null y no consulta Analytics', async () => {
        const fetchImpl = route({ channels: () => json({ items: [] }) });

        await expect(build(fetchImpl).read(TOKEN)).resolves.toBeNull();
        expect(fetchImpl).toHaveBeenCalledTimes(1);

        const sinItems = route({ channels: () => json({}) });
        await expect(build(sinItems).read(TOKEN)).resolves.toBeNull();
    });

    it('toma identidad, foto y suscriptores del canal', async () => {
        const reading = await build(route({})).read(TOKEN);

        expect(reading).toMatchObject({
            channelId: 'UCq-Fj5jknLsUf-MWSy4_brA',
            title: 'Canal de prueba',
            thumbnailUrl: 'https://yt3.example/foto.jpg',
            subscribers: 12_345,
        });
        expect(reading?.readAt).toEqual(NOW);
    });

    it('si el canal oculta sus suscriptores, informa cero en vez de inventar', async () => {
        const hidden = {
            items: [{ ...CHANNEL_RESPONSE.items[0], statistics: { hiddenSubscriberCount: true } }],
        };

        const reading = await build(route({ channels: () => json(hidden) })).read(TOKEN);

        expect(reading?.subscribers).toBe(0);
    });
});

describe('YouTubeAnalyticsReader — serie mensual', () => {
    it('pide 12 meses completos con ambas fechas en el día 1 de un mes', async () => {
        const fetchImpl = route({});

        await build(fetchImpl).read(TOKEN);

        const [call] = callsTo(fetchImpl, 'month');
        const params = call.url.searchParams;
        expect(call.url.origin + call.url.pathname).toBe('https://youtubeanalytics.googleapis.com/v2/reports');
        expect(params.get('ids')).toBe('channel==MINE');
        // Hoy es 9/10/2026: el último mes completo es septiembre.
        expect(params.get('startDate')).toBe('2025-10-01');
        expect(params.get('endDate')).toBe('2026-09-01');
        expect(params.get('metrics')).toBe('views,subscribersGained,subscribersLost,estimatedRevenue');
        expect(new Headers(call.init?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`);
    });

    it('las fechas siguen siendo día 1 cuando el año cambia', async () => {
        const fetchImpl = route({});

        await new YouTubeAnalyticsReader(fetchImpl, () => new Date('2027-01-15T00:00:00.000Z')).read(TOKEN);

        const [call] = callsTo(fetchImpl, 'month');
        expect(call.url.searchParams.get('startDate')).toBe('2026-01-01');
        expect(call.url.searchParams.get('endDate')).toBe('2026-12-01');
    });

    it('arma la serie con ingresos en centavos enteros (USD con decimales, redondeado)', async () => {
        const month = monthReport([
            ['2026-08', 45_000, 350, 25, 123.456],
            ['2026-09', 50_000, 500, 40, 0.29],
        ]);

        const reading = await build(route({ month: () => json(month) })).read(TOKEN);

        const monthly = reading!.monthly;
        expect(monthly.find((m) => m.month === '2026-08')).toEqual({
            month: '2026-08',
            views: 45_000,
            subscribersGained: 350,
            subscribersLost: 25,
            revenueCents: 12_346,
        });
        // 0.29 * 100 es 28.999999999999996 en punto flotante.
        expect(monthly.find((m) => m.month === '2026-09')!.revenueCents).toBe(29);
        expect(Number.isInteger(reading!.revenue12MonthsCents)).toBe(true);
    });

    it('suma vistas e ingresos de los 12 meses y rellena con ceros los meses sin datos', async () => {
        const month = monthReport([
            ['2026-08', 1_000, 10, 1, 10],
            ['2026-09', 2_000, 20, 2, 5.5],
        ]);

        const reading = await build(route({ month: () => json(month) })).read(TOKEN);

        expect(reading!.monthly).toHaveLength(12);
        expect(reading!.monthly[0].month).toBe('2025-10');
        expect(reading!.monthly[11].month).toBe('2026-09');
        expect(reading!.monthly[0]).toEqual({
            month: '2025-10',
            views: 0,
            subscribersGained: 0,
            subscribersLost: 0,
            revenueCents: 0,
        });
        expect(reading!.views12Months).toBe(3_000);
        expect(reading!.revenue12MonthsCents).toBe(1_550);
        expect(reading!.periodStart).toEqual(new Date('2025-10-01T00:00:00.000Z'));
        expect(reading!.periodEnd).toEqual(new Date('2026-09-30T00:00:00.000Z'));
    });

    it('un canal sin datos devuelve ceros, no falla ni se considera monetizado', async () => {
        const reading = await build(route({ month: () => json({ columnHeaders: MONTH_HEADERS }) })).read(TOKEN);

        expect(reading!.views12Months).toBe(0);
        expect(reading!.revenue12MonthsCents).toBe(0);
        expect(reading!.isMonetized()).toBe(false);
    });

    it('un ajuste de ingresos negativo no rompe la lectura: queda en cero', async () => {
        const month = monthReport([['2026-09', 100, 1, 0, -2.5]]);

        const reading = await build(route({ month: () => json(month) })).read(TOKEN);

        expect(reading!.monthly.find((m) => m.month === '2026-09')!.revenueCents).toBe(0);
    });

    it('lee las columnas por nombre, no por posición', async () => {
        const month = {
            columnHeaders: [
                { name: 'month' },
                { name: 'estimatedRevenue' },
                { name: 'views' },
                { name: 'subscribersLost' },
                { name: 'subscribersGained' },
            ],
            rows: [['2026-09', 2.5, 700, 3, 9]],
        };

        const reading = await build(route({ month: () => json(month) })).read(TOKEN);

        expect(reading!.monthly.find((m) => m.month === '2026-09')).toEqual({
            month: '2026-09',
            views: 700,
            subscribersGained: 9,
            subscribersLost: 3,
            revenueCents: 250,
        });
    });
});

describe('YouTubeAnalyticsReader — país principal', () => {
    it('pide el país con más vistas de los últimos 12 meses', async () => {
        const fetchImpl = route({});

        const reading = await build(fetchImpl).read(TOKEN);

        const [call] = callsTo(fetchImpl, 'country');
        const params = call.url.searchParams;
        expect(params.get('ids')).toBe('channel==MINE');
        expect(params.get('metrics')).toBe('views');
        expect(params.get('sort')).toBe('-views');
        expect(params.get('maxResults')).toBe('1');
        expect(params.get('startDate')).toBe('2025-10-01');
        expect(params.get('endDate')).toBe('2026-09-30');
        expect(reading!.topCountry).toBe('US');
    });

    it('sin vistas, Google no informa país y queda ausente', async () => {
        const reading = await build(
            route({ country: () => json({ columnHeaders: COUNTRY_REPORT.columnHeaders }) }),
        ).read(TOKEN);

        expect(reading!.topCountry).toBeUndefined();
    });
});

describe('YouTubeAnalyticsReader — fallas', () => {
    it.each([
        ['un 500', () => json({ error: { message: 'boom' } }, 500)],
        ['un 503', () => json({}, 503)],
        ['un 429', () => json({}, 429)],
        [
            'un 403 por cuota agotada',
            () => json({ error: { code: 403, errors: [{ reason: 'quotaExceeded' }] } }, 403),
        ],
    ])('%s es una falla del servicio de Google', async (_label, failing) => {
        for (const endpoint of ['channels', 'month', 'country'] as const) {
            const error = await build(route({ [endpoint]: failing })).read(TOKEN).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(ServiceUnavailableError);
        }
    });

    it('un error de red es una falla del servicio, sin arrastrar el token', async () => {
        const fetchImpl = vi.fn<Parameters<typeof fetch>, Promise<Response>>().mockRejectedValue(new Error(`fetch failed Bearer ${TOKEN}`));

        const error = await build(fetchImpl).read(TOKEN).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ServiceUnavailableError);
        expect(`${(error as Error).message} ${(error as Error).stack}`).not.toContain(TOKEN);
    });

    it.each([
        ['un 401 (token inválido)', 'channels', () => json({ error: { message: TOKEN } }, 401)],
        [
            'un 403 sin relación con la cuota (falta de permiso) al leer la serie mensual',
            'month',
            () => json({ error: { code: 403, errors: [{ reason: 'forbidden' }] } }, 403),
        ],
        [
            'un 403 sin relación con la cuota (falta de permiso) al leer el país',
            'country',
            () => json({ error: { code: 403, errors: [{ reason: 'forbidden' }] } }, 403),
        ],
    ] as const)('%s es una autorización revocada, sin arrastrar el token', async (_label, endpoint, failing) => {
        const error = await build(route({ [endpoint]: failing })).read(TOKEN).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(YouTubeAuthorizationRevokedError);
        expect(error).not.toBeInstanceOf(ServiceUnavailableError);
        expect((error as Error).message).not.toContain(TOKEN);
    });

    it('un 4xx que no es de autorización (400) no se hace pasar por una autorización revocada', async () => {
        const error = await build(route({ month: () => json({}, 400) })).read(TOKEN).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(YouTubeAuthorizationRevokedError);
        expect(error).not.toBeInstanceOf(ServiceUnavailableError);
    });

    it('una respuesta ilegible es una falla del servicio', async () => {
        const html = () => new Response('<html>caído</html>', { status: 200 });

        const error = await build(route({ channels: html })).read(TOKEN).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ServiceUnavailableError);
    });
});
