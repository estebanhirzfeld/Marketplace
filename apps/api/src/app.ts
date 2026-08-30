import Fastify, { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { Container, createContainer } from './container';
import { registerErrorHandler } from './http/errorHandler';
import { registerAuthRoutes } from './routes/auth';
import { registerListingRoutes } from './routes/listings';
import { registerOperationRoutes } from './routes/operations';
import { registerContractRoutes } from './routes/contracts';
import { registerMeRoutes } from './routes/me';

export interface BuildAppOptions {
    container?: Container;
    jwtSecret?: string;
    logger?: boolean;
}

/**
 * Construye la aplicación sin escuchar en ningún puerto, para que los tests
 * puedan usar `app.inject()` sin levantar un servidor real.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
    const app = Fastify({ logger: options.logger ?? false });
    const container = options.container ?? createContainer();

    const secret = options.jwtSecret ?? process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('Falta JWT_SECRET: la API no puede firmar tokens sin una clave.');
    }

    await app.register(fastifyJwt, { secret });

    registerErrorHandler(app);

    registerAuthRoutes(app, container);
    registerListingRoutes(app, container);
    registerOperationRoutes(app, container);
    registerContractRoutes(app, container);
    registerMeRoutes(app, container);

    app.get('/health', async () => ({ status: 'ok' }));

    return app;
}
