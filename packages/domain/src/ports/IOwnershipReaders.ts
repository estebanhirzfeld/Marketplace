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

/** Quién inició sesión en Google, tal como lo informa el propio Google. */
export interface GoogleAuthorizer {
    email: string;
    emailVerified: boolean;
    /** Identificador estable de la cuenta de Google (no cambia aunque cambie el correo). */
    subject: string;
}

export interface AuthorizedYouTubeChannels {
    /** `null` cuando Google no informó la identidad de quien autorizó. */
    authorizer: GoogleAuthorizer | null;
    channels: OwnedYouTubeChannel[];
}

/**
 * Lo que necesita la verificación del acceso de la plataforma: además de los
 * canales, quién es la persona que inició sesión, para comprobar que usó la
 * cuenta de custodia y no otra que casualmente administre el canal.
 */
export interface IYouTubeCustodyAccessReader {
    authorizedChannelsOf(grant: string): Promise<AuthorizedYouTubeChannels>;
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

/**
 * Emite el valor que el vendedor tiene que publicar en el DNS de su dominio
 * para demostrar que lo controla.
 *
 * Es una función pura de `(listing, dominio)`: el mismo par da siempre el mismo
 * valor, así que no hace falta guardarlo y el vendedor puede pedirlo las veces
 * que quiera. Ligarlo al listing evita que un TXT publicado para un sitio sirva
 * para otro.
 */
export interface IOwnershipChallengeIssuer {
    /** El valor completo del registro TXT, por ejemplo `traspaso-verificacion=<hex>`. */
    tokenFor(listingId: string, domain: string): string;
}

/**
 * Consulta de DNS para la titularidad de un sitio.
 *
 * Que el nombre no exista no es un error: los dos métodos devuelven `[]`, y
 * "todavía no está el registro" es justamente la respuesta esperada mientras el
 * vendedor lo carga. Solo una falla de transporte (red caída, tiempo agotado,
 * servidores que no responden) se informa lanzando `ServiceUnavailableError`,
 * para que el transporte pueda pedir que se reintente más tarde.
 */
export interface IDnsResolver {
    /** Servidores de nombres autoritativos del dominio. Vacío si no existe. */
    nameserversOf(domain: string): Promise<string[]>;
    /** Valores de los registros TXT del dominio, uno por registro. Vacío si no existe. */
    txtRecordsOf(domain: string): Promise<string[]>;
}
