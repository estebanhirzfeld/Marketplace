import 'dotenv/config';
import { buildApp } from './app';
import { resolveListenHost } from './config/network';

/**
 * Entrypoint del servidor. `buildApp` no escucha en ningún puerto para que los
 * tests puedan usar `inject()`; acá se agrega el listen.
 */
async function main() {
    const app = await buildApp({ logger: true });
    const port = Number(process.env.PORT ?? 3001);
    const host = resolveListenHost(process.env);

    try {
        await app.listen({ port, host });
    } catch (error) {
        app.log.error(error);
        process.exit(1);
    }
}

main();
