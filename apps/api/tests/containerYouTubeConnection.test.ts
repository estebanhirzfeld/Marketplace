import { describe, it, expect, afterEach, vi } from 'vitest';
import { createContainer } from '../src/container';

/**
 * El cableado de la conexión de canales de YouTube según el entorno. No toca
 * la base: armar el contenedor solo construye repositorios.
 */

const KEY = Buffer.alloc(32, 7).toString('base64');

function configure(values: Record<string, string>) {
    const all: Record<string, string> = {
        MP_TOKEN_ENCRYPTION_KEY: KEY,
        YOUTUBE_OAUTH_CLIENT_ID: 'cliente.apps.googleusercontent.com',
        YOUTUBE_OAUTH_CLIENT_SECRET: 'secreto',
        YOUTUBE_OAUTH_REDIRECT_URI: 'https://traspaso.forzalabs.online/api/youtube/callback',
        ...values,
    };
    for (const [name, value] of Object.entries(all)) {
        vi.stubEnv(name, value);
    }
}

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('Contenedor — conexión de canales de YouTube', () => {
    it('con las tres variables de OAuth y la clave de cifrado arma los casos de uso', () => {
        configure({});

        const c = createContainer();

        expect(c.youtubeConnectionOAuth).toBeDefined();
        expect(c.connectYouTubeChannel).toBeDefined();
        expect(c.listYouTubeConnections).toBeDefined();
        expect(c.createListingFromYouTubeConnection).toBeDefined();
    });

    it.each(['YOUTUBE_OAUTH_CLIENT_ID', 'YOUTUBE_OAUTH_CLIENT_SECRET', 'YOUTUBE_OAUTH_REDIRECT_URI'])(
        'si falta %s no arma nada',
        (missing) => {
            configure({ [missing]: '   ' });

            const c = createContainer();

            expect(c.youtubeConnectionOAuth).toBeUndefined();
            expect(c.connectYouTubeChannel).toBeUndefined();
            expect(c.listYouTubeConnections).toBeUndefined();
            expect(c.createListingFromYouTubeConnection).toBeUndefined();
        },
    );

    it('sin la clave de cifrado no hay dónde guardar el token: no arma nada', () => {
        configure({ MP_TOKEN_ENCRYPTION_KEY: '' });

        const c = createContainer();

        expect(c.youtubeConnectionOAuth).toBeUndefined();
        expect(c.connectYouTubeChannel).toBeUndefined();
        expect(c.createListingFromYouTubeConnection).toBeUndefined();
    });

    it('la verificación de titularidad sigue disponible aunque falte la clave de cifrado', () => {
        configure({ MP_TOKEN_ENCRYPTION_KEY: '' });

        const c = createContainer();

        expect(c.googleOAuth).toBeDefined();
    });
});
