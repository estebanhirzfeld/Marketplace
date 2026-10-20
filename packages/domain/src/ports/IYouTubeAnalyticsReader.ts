import { YouTubeChannelAnalytics } from '../value-objects/YouTubeChannelAnalytics';

/**
 * Puerto de lectura de YouTube Analytics con el permiso del vendedor.
 *
 * Recibe un token de acceso ya emitido (el adaptador lo obtiene, por ejemplo,
 * con el token de actualización que descifra él mismo) y devuelve lo que
 * Google informa del canal. El dominio no sabe de HTTP ni de cuotas.
 */
export interface IYouTubeAnalyticsReader {
    /**
     * `null` cuando la cuenta de Google no tiene ningún canal. Los fallos de
     * red o de Google se lanzan: no son una respuesta.
     */
    read(accessToken: string): Promise<YouTubeChannelAnalytics | null>;
}
