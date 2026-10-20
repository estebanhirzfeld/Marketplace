import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerErrorHandler } from '../src/http/errorHandler';
import { ServiceUnavailableError, ValidationError } from '@marketplace/domain/src/errors/DomainError';

/**
 * El manejador de errores con un logger que captura lo que se registra. Solo
 * el registro importa acá: la traducción a HTTP ya la cubren los tests de rutas.
 */
function buildApp(failure: Error) {
    const lines: Array<Record<string, unknown>> = [];
    const app = Fastify({
        logger: { level: 'error', stream: { write: (line: string) => void lines.push(JSON.parse(line)) } },
    });
    registerErrorHandler(app);
    app.get('/falla', async () => {
        throw failure;
    });
    return { app, lines };
}

describe('registerErrorHandler — registro de la causa', () => {
    it('registra la causa de un error de dominio y no la muestra al cliente', async () => {
        const cause = new TypeError('causa-secreta');
        const { app, lines } = buildApp(new ServiceUnavailableError('No disponible.', { cause }));

        const res = await app.inject({ method: 'GET', url: '/falla' });

        expect(res.statusCode).toBe(503);
        expect(res.body).not.toContain('causa-secreta');
        expect(lines).toHaveLength(1);
        expect(JSON.stringify(lines[0])).toContain('causa-secreta');
    });

    it('no registra nada si el error de dominio no trae causa', async () => {
        const { app, lines } = buildApp(new ValidationError('dato inválido'));

        const res = await app.inject({ method: 'GET', url: '/falla' });

        expect(res.statusCode).toBe(400);
        expect(lines).toHaveLength(0);
    });
});
