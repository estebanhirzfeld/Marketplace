import { YouTubeChannelRef } from '../value-objects/YouTubeChannelRef';

/**
 * Lo que la API pública de YouTube deja ver de un canal.
 *
 * Es deliberadamente pequeño: son los únicos datos que se pueden comprobar sin
 * el consentimiento del dueño. El ingreso mensual no está —y no puede estar—
 * porque las métricas monetarias solo existen en los reportes de content
 * owner, reservados a redes certificadas.
 */
export interface YouTubeChannelSnapshot {
    channelId: string;
    title: string;
    /**
     * Ausente cuando el canal eligió ocultarlo. Cuando viene, la propia API lo
     * entrega redondeado hacia abajo a tres cifras significativas, así que no
     * es el número exacto ni puede serlo.
     */
    subscribers?: number;
    views: number;
    /** Solo los videos públicos, incluso consultando como dueño. */
    publicVideos: number;
    readAt: Date;
}

/**
 * Puerto de lectura de canales de YouTube.
 *
 * El adaptador vive del lado del servidor porque la clave de API no puede
 * viajar a un cliente. El dominio solo conoce esta interfaz, así que los casos
 * de uso se prueban sin red.
 */
export interface IYouTubeChannelReader {
    /** `null` cuando el canal no existe o dejó de estar disponible. */
    read(ref: YouTubeChannelRef): Promise<YouTubeChannelSnapshot | null>;
}
