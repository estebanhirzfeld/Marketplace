import 'dotenv/config';
import { buildApp } from './app';

/**
 * Entrypoint del servidor. `buildApp` no escucha en ningún puerto para que los
 * tests puedan usar `inject()`; acá se agrega el listen.
 */
async function main() {
    const app = await buildApp({ logger: true });
    const port = Number(process.env.PORT ?? 3001);

    try {
        await app.listen({ port, host: '0.0.0.0' });
    } catch (error) {
        app.log.error(error);
        process.exit(1);
    }
}

main();
