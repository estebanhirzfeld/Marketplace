import {
    AdSenseEarnings,
    IAdSenseReader,
    IYouTubeOwnershipReader,
    OwnedYouTubeChannel,
} from '@marketplace/domain/src/ports/IOwnershipReaders';
import { GoogleOAuthClient, SCOPE_ADSENSE, SCOPE_YOUTUBE } from './GoogleOAuthClient';

const YOUTUBE_CHANNELS = 'https://www.googleapis.com/youtube/v3/channels';
const ADSENSE_ACCOUNTS = 'https://adsense.googleapis.com/v2/accounts';

/**
 * Los dos adaptadores canjean el código por un token, hacen una sola llamada y
 * descartan el token. El `grant` que reciben es el código de autorización que
 * el navegador del vendedor trajo de vuelta; el dominio no sabe que es OAuth.
 */

async function comoJson<T>(respuesta: Response, queSeConsultaba: string): Promise<T> {
    if (!respuesta.ok) {
        // El cuerpo del error puede traer el token: no se propaga.
        throw new Error(`Google respondió ${respuesta.status} al consultar ${queSeConsultaba}.`);
    }
    return (await respuesta.json()) as T;
}

function autorizado(token: string): HeadersInit {
    return { authorization: `Bearer ${token}`, accept: 'application/json' };
}

/**
 * Qué canales controla quien autorizó.
 *
 * `mine=true` devuelve, según la documentación, *"only return channels owned by
 * the authenticated user"*. Es la única forma de probar el control de un canal:
 * no hay ningún campo que liste los propietarios de un canal ajeno.
 */
export class YouTubeOAuthOwnershipReader implements IYouTubeOwnershipReader {
    constructor(
        private readonly oauth: GoogleOAuthClient,
        private readonly fetchImpl: typeof fetch = fetch,
    ) {}

    static scope = SCOPE_YOUTUBE;

    async channelsOf(grant: string): Promise<OwnedYouTubeChannel[]> {
        const token = await this.oauth.exchange(grant);

        const url = new URL(YOUTUBE_CHANNELS);
        url.searchParams.set('part', 'snippet');
        url.searchParams.set('mine', 'true');

        const cuerpo = await comoJson<{
            items?: Array<{ id?: unknown; snippet?: { title?: unknown } }>;
        }>(await this.fetchImpl(url.toString(), { headers: autorizado(token) }), 'los canales propios');

        return (cuerpo.items ?? [])
            .filter((i): i is { id: string; snippet?: { title?: unknown } } => typeof i.id === 'string')
            .map((i) => ({
                channelId: i.id,
                title: typeof i.snippet?.title === 'string' ? i.snippet.title : '',
            }));
    }
}

/**
 * Ingreso que AdSense atribuye a un dominio.
 *
 * La dimensión se llama `OWNED_SITE_DOMAIN_NAME` y la documentación la define
 * como *"Domain name of a verified site"*: Google ya comprobó por su cuenta
 * que ese sitio pertenece a la cuenta. Que el dominio aparezca en el reporte
 * prueba de una sola vez que el vendedor controla la cuenta que cobra y que es
 * ese sitio el que genera el ingreso.
 */
export class AdSenseApiReader implements IAdSenseReader {
    constructor(
        private readonly oauth: GoogleOAuthClient,
        private readonly fetchImpl: typeof fetch = fetch,
    ) {}

    static scope = SCOPE_ADSENSE;

    async monthlyEarningsFor(grant: string, domain: string): Promise<AdSenseEarnings | null> {
        const token = await this.oauth.exchange(grant);

        const cuentas = await comoJson<{ accounts?: Array<{ name?: unknown }> }>(
            await this.fetchImpl(ADSENSE_ACCOUNTS, { headers: autorizado(token) }),
            'las cuentas de AdSense',
        );

        const cuenta = cuentas.accounts?.find((c) => typeof c.name === 'string');
        if (!cuenta || typeof cuenta.name !== 'string') return null;

        const url = new URL(`${ADSENSE_ACCOUNTS.replace('/accounts', '')}/${cuenta.name}/reports:generate`);
        url.searchParams.set('dateRange', 'LAST_30_DAYS');
        url.searchParams.append('metrics', 'ESTIMATED_EARNINGS');
        url.searchParams.append('dimensions', 'OWNED_SITE_DOMAIN_NAME');

        const reporte = await comoJson<ReporteDeAdSense>(
            await this.fetchImpl(url.toString(), { headers: autorizado(token) }),
            'el reporte de ingresos',
        );

        return leerFila(reporte, domain);
    }
}

interface ReporteDeAdSense {
    headers?: Array<{ name?: unknown; currencyCode?: unknown }>;
    rows?: Array<{ cells?: Array<{ value?: unknown }> }>;
    startDate?: { year?: number; month?: number; day?: number };
    endDate?: { year?: number; month?: number; day?: number };
}

/**
 * El reporte trae una fila por dominio: la primera celda es el dominio y la
 * segunda el ingreso, siempre como string. Que el dominio no esté es la
 * respuesta que buscábamos, no un error.
 */
function leerFila(reporte: ReporteDeAdSense, domain: string): AdSenseEarnings | null {
    const buscado = domain.trim().toLowerCase().replace(/^www\./, '');

    const fila = (reporte.rows ?? []).find((f) => {
        const celda = f.cells?.[0]?.value;
        return (
            typeof celda === 'string' &&
            celda.trim().toLowerCase().replace(/^www\./, '') === buscado
        );
    });

    if (!fila) return null;

    const bruto = fila.cells?.[1]?.value;
    const monto = typeof bruto === 'string' ? Number(bruto) : undefined;
    if (monto === undefined || !Number.isFinite(monto)) return null;

    const cabecera = reporte.headers?.find((h) => h.name === 'ESTIMATED_EARNINGS');

    return {
        // El ingreso viene con decimales; el sistema entero trabaja en centavos.
        earningsCents: Math.round(monto * 100),
        currency: typeof cabecera?.currencyCode === 'string' ? cabecera.currencyCode : 'USD',
        from: aFecha(reporte.startDate),
        to: aFecha(reporte.endDate),
    };
}

function aFecha(d?: { year?: number; month?: number; day?: number }): Date {
    if (!d?.year || !d.month || !d.day) return new Date();
    return new Date(Date.UTC(d.year, d.month - 1, d.day));
}
