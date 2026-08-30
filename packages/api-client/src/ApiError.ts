import { ApiErrorCode, ApiErrorDto } from '@marketplace/api-contract';

/**
 * Error de la API tal como lo ve un cliente.
 *
 * Conserva el `code` estable del dominio además del status HTTP: la UI puede
 * decidir sobre el code, que es semántico, en vez de sobre el número.
 */
export class ApiError extends Error {
    constructor(
        public readonly code: ApiErrorCode,
        message: string,
        public readonly status: number,
    ) {
        super(message);
        this.name = 'ApiError';
        Object.setPrototypeOf(this, ApiError.prototype);
    }

    static fromResponse(status: number, body: unknown): ApiError {
        if (esApiErrorDto(body)) {
            return new ApiError(body.code, body.message, status);
        }
        return new ApiError('INTERNAL', `La API respondió ${status}.`, status);
    }

    /** Sesión ausente o vencida: la UI debería mandar a login. */
    get requiereLogin(): boolean {
        return this.code === 'UNAUTHORIZED';
    }
}

function esApiErrorDto(body: unknown): body is ApiErrorDto {
    return (
        typeof body === 'object' &&
        body !== null &&
        typeof (body as ApiErrorDto).code === 'string' &&
        typeof (body as ApiErrorDto).message === 'string'
    );
}
