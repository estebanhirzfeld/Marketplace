import type { YouTubeConnectionDto } from '@marketplace/api-contract';

/**
 * El identificador del canal dentro de la dirección que arma la plataforma al
 * publicar (`https://www.youtube.com/channel/UC…`). Una dirección con `@handle`
 * no lo trae, y ahí no hay conexión que buscar.
 */
export function channelIdFromUrl(url: unknown): string | undefined {
    if (typeof url !== 'string') return undefined;
    return /\/channel\/([A-Za-z0-9_-]+)/.exec(url)?.[1];
}

/**
 * La foto de cada canal conectado, por identificador, para dibujar un listado
 * con un solo pedido. Sin lectura (`undefined`: el pedido falló) o sin
 * conexiones el mapa queda vacío y el listado se dibuja igual, sin fotos.
 */
export function thumbnailsByChannelId(connections: readonly YouTubeConnectionDto[] | undefined): Map<string, string> {
    const fotos = new Map<string, string>();
    for (const c of connections ?? []) {
        if (c.thumbnailUrl) fotos.set(c.channelId, c.thumbnailUrl);
    }
    return fotos;
}

/** Si el valor es una dirección web que se puede abrir (solo http y https). */
export function isWebAddress(value: unknown): value is string {
    return typeof value === 'string' && /^https?:\/\//i.test(value);
}

/**
 * La dirección del canal para leer de un vistazo: sin protocolo ni `www.`, y
 * con el identificador `UC…` abreviado (empieza y termina igual, pero no ocupa
 * media línea). El enlace real conserva la dirección completa.
 */
export function shortenChannelUrl(url: string): string {
    const bare = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    return bare.replace(/\/channel\/(UC[A-Za-z0-9_-]{2})[A-Za-z0-9_-]{6,}([A-Za-z0-9_-]{4})/, '/channel/$1…$2');
}
