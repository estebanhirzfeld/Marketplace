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

    constructor(message: string) {
        super(message);
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

/** Los datos recibidos no cumplen una invariante del dominio. */
export class ValidationError extends DomainError {
    public readonly code = 'VALIDATION';
}
