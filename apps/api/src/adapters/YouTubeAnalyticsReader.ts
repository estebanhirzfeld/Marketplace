import { IYouTubeAnalyticsReader } from '@marketplace/domain/src/ports/IYouTubeAnalyticsReader';
import {
    MonthlyAnalytics,
    YouTubeChannelAnalytics,
} from '@marketplace/domain/src/value-objects/YouTubeChannelAnalytics';
import { ServiceUnavailableError } from '@marketplace/domain/src/errors/DomainError';
import { fetchOrUnavailable, isQuotaError, isTransientStatus } from './googleHttp';

const CHANNELS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/channels';
const REPORTS_ENDPOINT = 'https://youtubeanalytics.googleapis.com/v2/reports';
const MONTHS = 12;
const UNAVAILABLE_MESSAGE = 'No se pudo leer el canal en Google.';

/**
 * Lee un canal con el permiso del vendedor: identidad y suscriptores del Data
 * API, y vistas, suscriptores ganados/perdidos, ingresos y país de Analytics.
 *
 * Las fallas se separan en dos: red, 5xx, 429 y cuota agotada son
 * `ServiceUnavailableError` (reintentar más tarde puede funcionar); el resto
 * (token inválido, falta de permiso) es un `Error` común. Ningún mensaje
 * incluye el token ni el cuerpo de la respuesta.
 */
export class YouTubeAnalyticsReader implements IYouTubeAnalyticsReader {
    constructor(
        private readonly fetchImpl: typeof fetch = fetch,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async read(accessToken: string): Promise<YouTubeChannelAnalytics | null> {
        const channel = await this.readChannel(accessToken);
        if (!channel) return null;

        const window = lastTwelveCompleteMonths(this.now());
        const monthly = await this.readMonthlySeries(accessToken, window);
        const topCountry = await this.readTopCountry(accessToken, window);

        return YouTubeChannelAnalytics.create({
            channelId: channel.id,
            title: channel.title,
            ...(channel.thumbnailUrl ? { thumbnailUrl: channel.thumbnailUrl } : {}),
            subscribers: channel.subscribers,
            views12Months: sum(monthly, (m) => m.views),
            revenue12MonthsCents: sum(monthly, (m) => m.revenueCents),
            monthly,
            ...(topCountry ? { topCountry } : {}),
            periodStart: window.start,
            periodEnd: window.end,
            readAt: this.now(),
        });
    }

    private async readChannel(accessToken: string) {
        const url = new URL(CHANNELS_ENDPOINT);
        url.searchParams.set('part', 'snippet,statistics');
        // Solo los canales de quien autorizó: la única forma de probar el control.
        url.searchParams.set('mine', 'true');

        const body = asRecord(await this.getJson(url, accessToken));
        const items = Array.isArray(body?.items) ? body.items : [];
        const item = asRecord(items[0]);
        if (!item) return null;

        const snippet = asRecord(item.snippet);
        const statistics = asRecord(item.statistics);
        if (typeof item.id !== 'string' || typeof snippet?.title !== 'string') {
            throw new ServiceUnavailableError(UNAVAILABLE_MESSAGE);
        }

        const thumbnails = asRecord(snippet.thumbnails);
        const thumbnail = asRecord(thumbnails?.medium) ?? asRecord(thumbnails?.default);
        // Un canal que oculta sus suscriptores no trae el número: cero, no un invento.
        const subscribers = Number(statistics?.subscriberCount);

        return {
            id: item.id,
            title: snippet.title,
            thumbnailUrl: typeof thumbnail?.url === 'string' ? thumbnail.url : undefined,
            subscribers: Number.isInteger(subscribers) && subscribers > 0 ? subscribers : 0,
        };
    }

    /**
     * Con `dimensions=month`, `startDate` y `endDate` tienen que ser AMBAS el
     * día 1 de un mes; cualquier otro día lo rechaza Google con un 400.
     */
    private async readMonthlySeries(accessToken: string, window: Window): Promise<MonthlyAnalytics[]> {
        const url = new URL(REPORTS_ENDPOINT);
        url.searchParams.set('ids', 'channel==MINE');
        url.searchParams.set('startDate', isoDay(window.start));
        url.searchParams.set('endDate', isoDay(window.lastMonthStart));
        url.searchParams.set('dimensions', 'month');
        url.searchParams.set('metrics', 'views,subscribersGained,subscribersLost,estimatedRevenue');

        const report = asRecord(await this.getJson(url, accessToken));
        const rowsByMonth = new Map<string, MonthlyAnalytics>();
        for (const row of reportRows(report)) {
            const month = row.month;
            if (typeof month !== 'string') continue;
            rowsByMonth.set(month, {
                month,
                views: count(row.views),
                subscribersGained: count(row.subscribersGained),
                subscribersLost: count(row.subscribersLost),
                revenueCents: revenueToCents(row.estimatedRevenue),
            });
        }

        // Google omite los meses sin datos: se rellenan con ceros para que
        // el promedio de los últimos tres meses cuente meses, no filas.
        return monthKeys(window.start).map(
            (month) =>
                rowsByMonth.get(month) ?? {
                    month,
                    views: 0,
                    subscribersGained: 0,
                    subscribersLost: 0,
                    revenueCents: 0,
                },
        );
    }

    private async readTopCountry(accessToken: string, window: Window): Promise<string | undefined> {
        const url = new URL(REPORTS_ENDPOINT);
        url.searchParams.set('ids', 'channel==MINE');
        url.searchParams.set('startDate', isoDay(window.start));
        url.searchParams.set('endDate', isoDay(window.end));
        url.searchParams.set('dimensions', 'country');
        url.searchParams.set('metrics', 'views');
        url.searchParams.set('sort', '-views');
        url.searchParams.set('maxResults', '1');

        const [first] = reportRows(asRecord(await this.getJson(url, accessToken)));
        return typeof first?.country === 'string' && first.country !== '' ? first.country : undefined;
    }

    private async getJson(url: URL, accessToken: string): Promise<unknown> {
        const response = await fetchOrUnavailable(
            this.fetchImpl,
            url.toString(),
            { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' } },
            UNAVAILABLE_MESSAGE,
        );

        if (isTransientStatus(response.status) || (response.status === 403 && (await isQuotaError(response)))) {
            throw new ServiceUnavailableError(`Google no pudo responder (${response.status}).`);
        }
        if (!response.ok) {
            // El cuerpo del error puede traer el token: no se propaga.
            throw new Error(`Google respondió ${response.status} al leer el canal.`);
        }

        try {
            return await response.json();
        } catch {
            throw new ServiceUnavailableError(UNAVAILABLE_MESSAGE);
        }
    }
}

interface Window {
    /** Día 1 del primer mes (hace 12 meses completos). */
    start: Date;
    /** Día 1 del último mes completo: es el `endDate` de la serie mensual. */
    lastMonthStart: Date;
    /** Último día del último mes completo: cierra el período y el reporte por país. */
    end: Date;
}

/** Los 12 meses completos que terminan el mes pasado, todo en UTC. */
function lastTwelveCompleteMonths(now: Date): Window {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    return {
        start: new Date(Date.UTC(year, month - MONTHS, 1)),
        lastMonthStart: new Date(Date.UTC(year, month - 1, 1)),
        end: new Date(Date.UTC(year, month, 0)),
    };
}

function monthKeys(start: Date): string[] {
    return Array.from({ length: MONTHS }, (_, i) => {
        const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
        return date.toISOString().slice(0, 7);
    });
}

function isoDay(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/** Convierte las filas posicionales del reporte en objetos por nombre de columna. */
function reportRows(report: Record<string, unknown> | undefined): Array<Record<string, unknown>> {
    const headers = Array.isArray(report?.columnHeaders) ? report.columnHeaders : [];
    const names = headers.map((h) => asRecord(h)?.name);
    const rows = Array.isArray(report?.rows) ? report.rows : [];

    return rows
        .filter((row): row is unknown[] => Array.isArray(row))
        .map((row) => Object.fromEntries(names.flatMap((name, i) => (typeof name === 'string' ? [[name, row[i]]] : []))));
}

function count(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

/**
 * El ingreso llega en dólares con decimales; el sistema trabaja en centavos
 * enteros. Un ajuste negativo se deja en cero: el ingreso de un mes no resta.
 */
function revenueToCents(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value * 100)) : 0;
}

function sum<T>(items: T[], pick: (item: T) => number): number {
    return items.reduce((total, item) => total + pick(item), 0);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null
        ? Object.fromEntries(Object.entries(value))
        : undefined;
}
