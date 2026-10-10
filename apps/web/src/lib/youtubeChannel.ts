/**
 * El identificador del canal dentro de la dirección que arma la plataforma al
 * publicar (`https://www.youtube.com/channel/UC…`). Una dirección con `@handle`
 * no lo trae, y ahí no hay conexión que buscar.
 */
export function channelIdFromUrl(url: unknown): string | undefined {
    if (typeof url !== 'string') return undefined;
    return /\/channel\/([A-Za-z0-9_-]+)/.exec(url)?.[1];
}
