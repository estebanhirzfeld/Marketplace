import { describe, it, expect, vi } from 'vitest';
import { MercadoPagoOAuthClient } from '../src/adapters/MercadoPagoOAuthClient';

/**
 * El cliente de OAuth de Mercado Pago contra respuestas fabricadas, con `fetch`
 * inyectado: ningún test sale a la red. Lo que más importa es que ningún error
 * deje escapar el secreto de la aplicación, el código, el verificador ni los
 * tokens.
 */

const CONFIG = {
    clientId: '1234567890',
    clientSecret: 'SECRETO-DE-LA-APP',
    redirectUri: 'https://traspaso.forzalabs.online/mercadopago/callback',
};

function json(cuerpo: unknown, status = 200): Response {
    return new Response(JSON.stringify(cuerpo), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

/** La forma real de la respuesta del endpoint de token. */
function respuestaDeToken(overrides: Record<string, unknown> = {}) {
    return {
        access_token: 'APP_USR-acceso-secreto',
        refresh_token: 'TG-refresco-secreto',
        expires_in: 15_552_000,
        user_id: 987654321,
        scope: 'offline_access read write',
        token_type: 'Bearer',
        ...overrides,
    };
}

function armar(timeoutMs?: number) {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = new MercadoPagoOAuthClient({ ...CONFIG, timeoutMs }, fetchImpl);
    return { client, fetchImpl };
}

/** Todo lo que no debe aparecer jamás en un mensaje de error. */
const SECRETOS = [
    CONFIG.clientSecret,
    'codigo-secreto',
    'verificador-secreto',
    'APP_USR-acceso-secreto',
    'TG-refresco-secreto',
];

function noContieneSecretos(error: unknown) {
    const texto = `${(error as Error).message} ${(error as Error).stack ?? ''}`;
    for (const secreto of SECRETOS) {
        expect(texto).not.toContain(secreto);
    }
}

describe('MercadoPagoOAuthClient.authorizationUrl', () => {
    it('arma la dirección de autorización con PKCE S256', () => {
        const { client } = armar();

        const url = new URL(client.authorizationUrl({ state: 'estado-aleatorio', codeChallenge: 'desafio_abc-123' }));

        expect(url.origin + url.pathname).toBe('https://auth.mercadopago.com.ar/authorization');
        expect(url.searchParams.get('client_id')).toBe(CONFIG.clientId);
        expect(url.searchParams.get('response_type')).toBe('code');
        expect(url.searchParams.get('platform_id')).toBe('mp');
        expect(url.searchParams.get('state')).toBe('estado-aleatorio');
        expect(url.searchParams.get('redirect_uri')).toBe(CONFIG.redirectUri);
        expect(url.searchParams.get('code_challenge')).toBe('desafio_abc-123');
        expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    });

    it('codifica los valores: un state con caracteres especiales no rompe la dirección', () => {
        const { client } = armar();

        const crudo = client.authorizationUrl({ state: 'a&b=c d', codeChallenge: 'x' });
        const url = new URL(crudo);

        expect(url.searchParams.get('state')).toBe('a&b=c d');
        expect(crudo).not.toContain('a&b=c d');
    });

    it('nunca incluye el secreto de la aplicación', () => {
        const { client } = armar();

        expect(client.authorizationUrl({ state: 's', codeChallenge: 'c' })).not.toContain(CONFIG.clientSecret);
    });
});

describe('MercadoPagoOAuthClient.exchangeCode', () => {
    it('canjea el código y mapea la respuesta', async () => {
        const { client, fetchImpl } = armar();
        fetchImpl.mockResolvedValue(json(respuestaDeToken()));

        const tokens = await client.exchangeCode({ code: 'codigo-secreto', codeVerifier: 'verificador-secreto' });

        expect(tokens).toEqual({
            accessToken: 'APP_USR-acceso-secreto',
            refreshToken: 'TG-refresco-secreto',
            expiresInSeconds: 15_552_000,
            mpUserId: '987654321',
            scope: 'offline_access read write',
        });
    });

    it('hace POST JSON al endpoint de token con PKCE y sin tokens en la dirección', async () => {
        const { client, fetchImpl } = armar();
        fetchImpl.mockResolvedValue(json(respuestaDeToken()));

        await client.exchangeCode({ code: 'codigo-secreto', codeVerifier: 'verificador-secreto' });

        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe('https://api.mercadopago.com/oauth/token');
        expect(init?.method).toBe('POST');
        expect((init?.headers as Record<string, string>)['content-type']).toBe('application/json');
        expect(JSON.parse(String(init?.body))).toEqual({
            client_id: CONFIG.clientId,
            client_secret: CONFIG.clientSecret,
            grant_type: 'authorization_code',
            code: 'codigo-secreto',
            code_verifier: 'verificador-secreto',
            redirect_uri: CONFIG.redirectUri,
        });
        expect(String(url)).not.toContain('codigo-secreto');
    });

    it('acepta user_id como texto', async () => {
        const { client, fetchImpl } = armar();
        fetchImpl.mockResolvedValue(json(respuestaDeToken({ user_id: '555' })));

        const tokens = await client.exchangeCode({ code: 'c', codeVerifier: 'v' });

        expect(tokens.mpUserId).toBe('555');
    });

    it('un estado distinto de 200 falla sin filtrar el cuerpo ni los secretos', async () => {
        const { client, fetchImpl } = armar();
        fetchImpl.mockResolvedValue(
            json({ message: 'invalid_grant client_secret=SECRETO-DE-LA-APP code=codigo-secreto' }, 400),
        );

        const error = await client
            .exchangeCode({ code: 'codigo-secreto', codeVerifier: 'verificador-secreto' })
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('400');
        noContieneSecretos(error);
    });

    it.each([
        ['sin access_token', { access_token: undefined }],
        ['access_token vacío', { access_token: '' }],
        ['sin refresh_token', { refresh_token: undefined }],
        ['refresh_token que no es texto', { refresh_token: 42 }],
        ['expires_in en cero', { expires_in: 0 }],
        ['expires_in negativo', { expires_in: -5 }],
        ['expires_in que no es número', { expires_in: '15552000' }],
        ['expires_in no finito', { expires_in: null }],
        ['sin user_id', { user_id: undefined }],
        ['user_id vacío', { user_id: '' }],
        ['sin scope', { scope: undefined }],
    ])('una respuesta malformada (%s) falla', async (_nombre, defecto) => {
        const { client, fetchImpl } = armar();
        fetchImpl.mockResolvedValue(json(respuestaDeToken(defecto)));

        const error = await client
            .exchangeCode({ code: 'codigo-secreto', codeVerifier: 'verificador-secreto' })
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(Error);
        noContieneSecretos(error);
    });

    it('un cuerpo que no es JSON falla', async () => {
        const { client, fetchImpl } = armar();
        fetchImpl.mockResolvedValue(new Response('<html>caído</html>', { status: 200 }));

        await expect(client.exchangeCode({ code: 'c', codeVerifier: 'v' })).rejects.toThrow(Error);
    });

    it('un error de red falla sin filtrar el error original', async () => {
        const { client, fetchImpl } = armar();
        fetchImpl.mockRejectedValue(new Error('ECONNRESET body={"client_secret":"SECRETO-DE-LA-APP"}'));

        const error = await client
            .exchangeCode({ code: 'codigo-secreto', codeVerifier: 'verificador-secreto' })
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(Error);
        noContieneSecretos(error);
    });

    it('si Mercado Pago no responde a tiempo, corta con un error', async () => {
        const { client, fetchImpl } = armar(20);
        fetchImpl.mockImplementation(
            (_url, init) =>
                new Promise((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => reject(new Error('aborted client_secret=SECRETO-DE-LA-APP')));
                }),
        );

        const error = await client.exchangeCode({ code: 'c', codeVerifier: 'v' }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(Error);
        noContieneSecretos(error);
    });
});

describe('MercadoPagoOAuthClient.refresh', () => {
    it('renueva con grant_type refresh_token y mapea la respuesta', async () => {
        const { client, fetchImpl } = armar();
        fetchImpl.mockResolvedValue(
            json(respuestaDeToken({ access_token: 'APP_USR-nuevo', refresh_token: 'TG-nuevo', expires_in: 3600 })),
        );

        const tokens = await client.refresh('TG-viejo');

        expect(tokens).toMatchObject({
            accessToken: 'APP_USR-nuevo',
            refreshToken: 'TG-nuevo',
            expiresInSeconds: 3600,
        });
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe('https://api.mercadopago.com/oauth/token');
        expect(JSON.parse(String(init?.body))).toEqual({
            client_id: CONFIG.clientId,
            client_secret: CONFIG.clientSecret,
            grant_type: 'refresh_token',
            refresh_token: 'TG-viejo',
        });
    });

    it('un estado distinto de 200 falla sin filtrar secretos', async () => {
        const { client, fetchImpl } = armar();
        fetchImpl.mockResolvedValue(json({ error: 'invalid_grant', refresh_token: 'TG-refresco-secreto' }, 400));

        const error = await client.refresh('TG-refresco-secreto').catch((e: unknown) => e);

        expect(error).toBeInstanceOf(Error);
        noContieneSecretos(error);
    });

    it('una respuesta malformada falla', async () => {
        const { client, fetchImpl } = armar();
        fetchImpl.mockResolvedValue(json({ access_token: 'APP_USR-acceso-secreto' }));

        const error = await client.refresh('TG-refresco-secreto').catch((e: unknown) => e);

        expect(error).toBeInstanceOf(Error);
        noContieneSecretos(error);
    });

    it('un error de red falla sin filtrar el token de renovación', async () => {
        const { client, fetchImpl } = armar();
        fetchImpl.mockRejectedValue(new Error('fallo refresh_token=TG-refresco-secreto'));

        const error = await client.refresh('TG-refresco-secreto').catch((e: unknown) => e);

        expect(error).toBeInstanceOf(Error);
        noContieneSecretos(error);
    });
});
