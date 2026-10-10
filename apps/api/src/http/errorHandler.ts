import { FastifyInstance, FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import {
    DomainError,
    NotFoundError,
    ForbiddenError,
    InvalidStateError,
    ServiceUnavailableError,
    ChannelAlreadyListedError,
    ValidationError,
} from '@marketplace/domain/src/errors/DomainError';

/**
 * Traducción de errores de dominio a HTTP.
 *
 * El dominio no conoce códigos de estado — esa correspondencia vive acá, en el
 * único lugar que sabe que la aplicación se expone por HTTP.
 */
function statusFor(error: DomainError): number {
    if (error instanceof NotFoundError) return 404;
    if (error instanceof ForbiddenError) return 403;
    if (error instanceof InvalidStateError) return 409;
    if (error instanceof ValidationError) return 400;
    if (error instanceof ServiceUnavailableError) return 503;
    return 500;
}

export function registerErrorHandler(app: FastifyInstance): void {
    app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
        if (error instanceof DomainError) {
            // La causa original (un fallo inesperado detrás de un 503, por
            // ejemplo) nunca llega al cliente, pero tiene que quedar en el log.
            if (error.cause !== undefined) {
                request.log.error({ err: error.cause, code: error.code }, error.message);
            }
            // El dominio solo lleva el id del activo cuando es del propio
            // solicitante: el de otro vendedor nunca llega a este punto.
            if (error instanceof ChannelAlreadyListedError && error.listingId) {
                return reply.code(statusFor(error)).send({
                    code: error.code,
                    message: error.message,
                    listingId: error.listingId,
                });
            }
            return reply.code(statusFor(error)).send({
                code: error.code,
                message: error.message,
            });
        }

        // Errores de validación de schema de Fastify.
        if (error.validation) {
            return reply.code(400).send({
                code: 'VALIDATION',
                message: error.message,
            });
        }

        if (error.statusCode === 401) {
            return reply.code(401).send({
                code: 'UNAUTHORIZED',
                message: 'Credenciales ausentes o inválidas.',
            });
        }

        request.log.error(error);
        return reply.code(500).send({
            code: 'INTERNAL',
            message: 'Error interno del servidor.',
        });
    });
}
