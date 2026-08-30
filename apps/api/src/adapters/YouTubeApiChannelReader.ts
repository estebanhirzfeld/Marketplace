import {
    IYouTubeChannelReader,
    YouTubeChannelSnapshot,
} from '@marketplace/domain/src/ports/IYouTubeChannelReader';
import { YouTubeChannelRef } from '@marketplace/domain/src/value-objects/YouTubeChannelRef';

const ENDPOINT = 'https://www.googleapis.com/youtube/v3/channels';

/** La forma de la respuesta que nos interesa. Se valida, no se castea. */
interface RespuestaDeCanales {
    items?: Array<{
        id?: unknown;
        snippet?: { title?: unknown };
        statistics?: {
            subscriberCount?: unknown;
            hiddenSubscriberCount?: unknown;
            viewCount?: unknown;
            videoCount?: unknown;
        };
    }>;
}

/**
 * Lee un canal con la API pública de YouTube.
 *
 * Vive del lado del servidor porque la clave de API no puede viajar a un
 * cliente. Cuesta una unidad de cuota por consulta sobre un tope de 10.000
 * diarias, así que el límite práctico no es la cuota sino qué expone la API.
 *
 * Los contadores vienen como string en el JSON —son enteros de 64 bits que no
 * entran en un `number` de JavaScript sin perder precisión—, así que se
 * convierten acá y no en el dominio.
 */
export class YouTubeApiChannelReader implements IYouTubeChannelReader {
    constructor(
        private readonly apiKey: string,
        private readonly fetchImpl: typeof fetch = fetch,
    ) {}

    async read(ref: YouTubeChannelRef): Promise<YouTubeChannelSnapshot | null> {
        const url = new URL(ENDPOINT);
        url.searchParams.set('part', 'snippet,statistics');
        url.searchParams.set('key', this.apiKey);
        // `id` y `forHandle` son los dos únicos modos de búsqueda que sirven.
        url.searchParams.set(ref.kind === 'id' ? 'id' : 'forHandle', ref.value);

        const respuesta = await this.fetchImpl(url.toString(), {
            headers: { accept: 'application/json' },
        });

        if (respuesta.status === 404) return null;
        if (!respuesta.ok) {
            // El cuerpo del error trae la clave en algunos casos: no se propaga.
            throw new Error(`YouTube respondió ${respuesta.status} al consultar el canal.`);
        }

        const cuerpo = (await respuesta.json()) as RespuestaDeCanales;
        const item = cuerpo.items?.[0];

        // Una búsqueda sin resultados devuelve 200 con `items` vacío.
        if (!item || typeof item.id !== 'string') return null;

        const stats = item.statistics ?? {};
        const ocultos = stats.hiddenSubscriberCount === true;

        return {
            channelId: item.id,
            title: typeof item.snippet?.title === 'string' ? item.snippet.title : '',
            subscribers: ocultos ? undefined : entero(stats.subscriberCount),
            views: entero(stats.viewCount) ?? 0,
            publicVideos: entero(stats.videoCount) ?? 0,
            readAt: new Date(),
        };
    }
}

/**
 * Los contadores llegan como string. `undefined` si el campo falta o no es un
 * número: preferimos ausencia a un cero inventado, porque un cero se leería
 * como un canal vacío.
 */
function entero(valor: unknown): number | undefined {
    if (typeof valor === 'number' && Number.isFinite(valor)) return Math.trunc(valor);
    if (typeof valor !== 'string') return undefined;

    const n = Number(valor);
    return Number.isFinite(n) ? Math.trunc(n) : undefined;
}
