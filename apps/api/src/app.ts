import Fastify, { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { Container, createContainer } from './container';
import { registerErrorHandler } from './http/errorHandler';
import { registerAuthRoutes } from './routes/auth';
import { registerListingRoutes } from './routes/listings';
import { registerWebhookRoutes } from './routes/webhooks';
import { registerReportRoutes } from './routes/reports';
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
    /*
     * Qué modo está corriendo la API. Es público a propósito: cuando las
     * verificaciones están simuladas, la interfaz tiene que poder decirlo en
     * pantalla. Una constancia que no comprobó nada no puede parecerse a una
     * que sí, y esconder el modo sería justamente eso.
     */
    app.get('/config', async () => ({
        simulatedVerification: container.simulacionDeGoogle,
    }));

    registerListingRoutes(app, container);
    registerOperationRoutes(app, container);
    registerReportRoutes(app, container);
    registerWebhookRoutes(app, container);
    registerContractRoutes(app, container);
    registerMeRoutes(app, container);

    app.get('/health', async () => ({ status: 'ok' }));

    return app;
}
