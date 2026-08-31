import { createHash } from 'node:crypto';
import { IListingRepository } from '@marketplace/domain/src/ports/Repositories';
import {
    AdSenseEarnings,
    IAdSenseReader,
    IYouTubeOwnershipReader,
    OwnedYouTubeChannel,
} from '@marketplace/domain/src/ports/IOwnershipReaders';
import {
    IYouTubeChannelReader,
    YouTubeChannelSnapshot,
} from '@marketplace/domain/src/ports/IYouTubeChannelReader';
import { YouTubeChannelRef } from '@marketplace/domain/src/value-objects/YouTubeChannelRef';

/**
 * Verificaciones simuladas, para poder recorrer el resto del flujo sin tener
 * las credenciales de Google dadas de alta.
 *
 * Esto NO es un adaptador degradado que se activa solo cuando falta una clave:
 * se enciende con `SIMULATE_GOOGLE_VERIFICATION=true` y con nada más. La
 * diferencia importa. La plataforma vende que la titularidad está comprobada
 * contra la fuente, así que una constancia falsa que se cuele en producción
 * porque alguien olvidó una variable sería peor que no tener verificación: es
 * una atestiguación que miente, firmada por nosotros.
 *
 * Por eso además:
 *   · el permiso simulado lleva un prefijo reconocible y ningún otro se acepta;
 *   · el contenedor avisa por consola al arrancar;
 *   · la API lo expone para que la interfaz pueda decirlo en pantalla.
 *
 * Lo que se simula es la RESPUESTA de Google, no las reglas: los casos de uso
 * corren enteros, comparan identificadores y rechazan lo que no cierra.
 */

export const SIMULATED_GRANT_PREFIX = 'simulado:';

/** El permiso simulado transporta el activo, que es lo que Google no nos va a decir. */
export function simulatedGrantFor(listingId: string): string {
    return `${SIMULATED_GRANT_PREFIX}${listingId}`;
}

function listingIdFrom(grant: string): string | null {
    return grant.startsWith(SIMULATED_GRANT_PREFIX)
        ? grant.slice(SIMULATED_GRANT_PREFIX.length)
        : null;
}

/**
 * Un identificador estable a partir de la referencia publicada.
 *
 * Tiene que ser una función y no un valor al azar porque los dos lectores la
 * usan por separado y el caso de uso los compara: si no coincidieran, la
 * verificación simulada fallaría siempre. Un canal que ya viene con su
 * identificador se devuelve tal cual.
 */
function channelIdOf(ref: YouTubeChannelRef): string {
    if (ref.kind === 'id') return ref.value;
    const huella = createHash('sha256').update(ref.value).digest('base64url').slice(0, 22);
    return `UC${huella}`;
}

/** Resuelve la dirección publicada de un activo, sin llamar a YouTube. */
export class SimulatedYouTubeChannelReader implements IYouTubeChannelReader {
    async read(ref: YouTubeChannelRef): Promise<YouTubeChannelSnapshot | null> {
        return {
            channelId: channelIdOf(ref),
            title: `Canal simulado (${ref.toString()})`,
            // Se omiten los suscriptores a propósito: `undefined` significa
            // "no hay con qué comparar", que es una respuesta honesta de un
            // lector que no consultó nada.
            subscribers: undefined,
            views: 0,
            publicVideos: 0,
            readAt: new Date(),
        };
    }
}

/**
 * Responde que el vendedor controla exactamente el canal que publicó.
 *
 * Necesita el repositorio porque el permiso solo transporta el activo: de ahí
 * saca la dirección publicada y deriva el mismo identificador que el lector de
 * arriba. Un permiso que no sea simulado devuelve la lista vacía, y el caso de
 * uso lo rechaza como rechaza a cualquiera que no controle el canal.
 */
export class SimulatedYouTubeOwnershipReader implements IYouTubeOwnershipReader {
    constructor(private readonly listingRepo: IListingRepository) {}

    async channelsOf(grant: string): Promise<OwnedYouTubeChannel[]> {
        const listingId = listingIdFrom(grant);
        if (!listingId) return [];

        const listing = await this.listingRepo.findById(listingId);
        if (!listing) return [];

        const { assetData } = listing.assetDataFor(true);
        const url = assetData.channelUrl;
        if (typeof url !== 'string' || url.trim() === '') return [];

        const ref = YouTubeChannelRef.parse(url);
        return [{ channelId: channelIdOf(ref), title: `Canal simulado (${ref.toString()})` }];
    }
}

/**
 * Informa como ingreso comprobado el que el vendedor declaró.
 *
 * Es la simulación más delicada de las dos: en la vida real este número es el
 * único que la plataforma puede contrastar y por eso vale más que el resto.
 * Acá se devuelve lo declarado, así que la constancia queda diciendo que el
 * vendedor tiene razón. Con la simulación encendida, cualquier lectura de un
 * ingreso comprobado es exactamente tan confiable como la declaración.
 */
export class SimulatedAdSenseReader implements IAdSenseReader {
    constructor(private readonly listingRepo: IListingRepository) {}

    async monthlyEarningsFor(grant: string, domain: string): Promise<AdSenseEarnings | null> {
        const listingId = listingIdFrom(grant);
        if (!listingId) return null;

        const listing = await this.listingRepo.findById(listingId);
        if (!listing) return null;

        const { assetData } = listing.assetDataFor(true);
        if (assetData.domain !== domain) return null;

        const cents =
            typeof assetData.monthlyRevenueUsdCents === 'number'
                ? assetData.monthlyRevenueUsdCents
                : 0;

        const hasta = new Date();
        const desde = new Date(hasta.getTime() - 30 * 24 * 60 * 60 * 1000);

        return {
            earningsCents: cents,
            currency: typeof assetData.currency === 'string' ? assetData.currency : 'USD',
            from: desde,
            to: hasta,
        };
    }
}
