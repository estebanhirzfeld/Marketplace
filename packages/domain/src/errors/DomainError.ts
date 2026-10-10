/**
 * Taxonomía de errores de dominio.
 *
 * El dominio no conoce HTTP: nunca menciona códigos de estado. Expone un `code`
 * estable y un tipo distinguible, y es la capa de transporte (apps/api) la que
 * decide cómo traducirlos. Así el mismo error sirve a un endpoint REST, a un
 * job o a un test sin acoplar el dominio a ningún protocolo.
 */
export abstract class DomainError extends Error {
    /** Código estable para que el transporte discrimine sin parsear el mensaje. */
    public abstract readonly code: string;

    /**
     * `cause` es solo para diagnóstico: el transporte la registra y nunca la
     * muestra, porque puede traer datos de la respuesta de un tercero.
     */
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = new.target.name;

        // Sin esto, `instanceof` deja de funcionar si el target de compilación
        // baja a ES5 — y el error handler de la API se rompería en silencio.
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/** La entidad pedida no existe. */
export class NotFoundError extends DomainError {
    public readonly code = 'NOT_FOUND';
}

/** El actor existe pero no tiene permiso sobre este recurso. */
export class ForbiddenError extends DomainError {
    public readonly code = 'FORBIDDEN';
}

/** La operación es válida en general, pero no desde el estado actual. */
export class InvalidStateError extends DomainError {
    public readonly code = 'INVALID_STATE';
}

/**
 * No se pudo obtener el token del vendedor para consultar un pago que ya
 * ocurrió. Es un fallo transitorio de nuestro lado, no del aviso: el transporte
 * puede pedir que se reintente. El mensaje nunca incluye la causa original.
 */
export class SellerTokenUnavailableError extends DomainError {
    public readonly code = 'SELLER_TOKEN_UNAVAILABLE';

    constructor(
        message = 'No se pudo obtener el acceso del vendedor a Mercado Pago para confirmar el pago.',
    ) {
        super(message);
    }
}

/** Los datos recibidos no cumplen una invariante del dominio. */
export class ValidationError extends DomainError {
    public readonly code = 'VALIDATION';
}

/**
 * Un servicio externo (Google, por ejemplo) no pudo responder: red caída, error
 * 5xx o cuota agotada. No es culpa de quien hizo el pedido y reintentar más
 * tarde puede funcionar. El mensaje nunca incluye la causa original.
 */
export class ServiceUnavailableError extends DomainError {
    public readonly code = 'SERVICE_UNAVAILABLE';
}

/**
 * Google dejó de aceptar la autorización del vendedor (token inválido o falta
 * de permiso, sin relación con la cuota): reintentar no sirve, hay que volver a
 * conectar. Lo lanza el lector del canal para que el caso de uso lo distinga de
 * una falla transitoria o desconocida sin saber nada de HTTP.
 */
export class YouTubeAuthorizationRevokedError extends DomainError {
    public readonly code = 'YOUTUBE_AUTHORIZATION_REVOKED';
}

/**
 * El canal ya tiene un activo vigente. Lleva el id del activo solo cuando es
 * del propio solicitante, para que la pantalla pueda enlazarlo; el de otro
 * vendedor no se revela.
 */
export class ChannelAlreadyListedError extends InvalidStateError {
    constructor(
        message: string,
        public readonly ownedByRequester: boolean,
        public readonly listingId?: string,
    ) {
        super(message);
    }
}
