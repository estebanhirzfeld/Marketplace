/**
 * Lectura de lo que el vendedor demuestra controlar.
 *
 * Los dos puertos reciben un `grant`: una cadena opaca que el navegador del
 * vendedor produjo al autorizar. El dominio no sabe que es un código de OAuth
 * ni le importa; solo sabe que quien la presenta ya pasó por el consentimiento
 * de la fuente. Eso mantiene el detalle del protocolo del lado del adaptador y
 * deja los casos de uso probables sin red.
 *
 * Ninguno de los dos recibe ni devuelve tokens: se usan una vez y se descartan.
 */

export interface OwnedYouTubeChannel {
    channelId: string;
    title: string;
}

export interface IYouTubeOwnershipReader {
    /** Los canales que controla quien otorgó este permiso. Vacío si ninguno. */
    channelsOf(grant: string): Promise<OwnedYouTubeChannel[]>;
}

export interface AdSenseEarnings {
    /** Ingreso de los últimos 30 días atribuido al dominio, en centavos. */
    earningsCents: number;
    currency: string;
    from: Date;
    to: Date;
}

export interface IAdSenseReader {
    /**
     * Ingreso que la cuenta de AdSense de quien otorgó el permiso atribuye a
     * ese dominio.
     *
     * `null` cuando la cuenta no reporta ese dominio, que ya es una respuesta:
     * significa que quien autorizó no es quien monetiza ese sitio.
     */
    monthlyEarningsFor(grant: string, domain: string): Promise<AdSenseEarnings | null>;
}
