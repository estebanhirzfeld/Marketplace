import { describe, it, expect, vi } from 'vitest';
import { YouTubeConnectionOAuthClient } from '../src/adapters/YouTubeConnectionOAuthClient';
import { REQUIRED_YOUTUBE_SCOPES } from '@marketplace/domain/src/value-objects/YouTubeScopes';
import { ServiceUnavailableError } from '@marketplace/domain/src/errors/DomainError';

/**
 * El cliente de OAuth de la conexión del canal contra respuestas fabricadas,
 * con `fetch` inyectado: ningún test sale a la red. Lo que más importa es
 * distinguir "Google rechazó el código" (el vendedor debe reintentar) de
 * "Google no pudo responder" (no es culpa del vendedor), y que ningún error
 * deje escapar el secreto de la aplicación, el código ni los tokens.
 */

const CONFIG = {
    clientId: 'cliente.apps.googleusercontent.com',
    clientSecret: 'SECRETO-DE-LA-APP',
    redirectUri: 'https://traspaso.forzalabs.online/api/youtube/callback',
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function tokenResponse(overrides: Record<string, unknown> = {}) {
    return {
        access_token: 'ya29.acceso-secreto',
        refresh_token: '1//refresco-secreto',
        expires_in: 3599,
        scope: REQUIRED_YOUTUBE_SCOPES.join(' '),
        token_type: 'Bearer',
        ...overrides,
    };
}

function build() {
    const fetchImpl = vi.fn<Parameters<typeof fetch>, Promise<Response>>();
    const client = new YouTubeConnectionOAuthClient(CONFIG, fetchImpl);
    return { client, fetchImpl };
}

const SECRETS = [CONFIG.clientSecret, 'codigo-secreto', 'ya29.acceso-secreto', '1//refresco-secreto'];

function expectNoSecrets(error: unknown) {
    const text = `${(error as Error).message} ${(error as Error).stack ?? ''}`;
    for (const secret of SECRETS) {
        expect(text).not.toContain(secret);
    }
}

describe('YouTubeConnectionOAuthClient.authorizationUrl', () => {
    it('pide los tres permisos, acceso offline y consentimiento', () => {
        const { client } = build();

        const url = new URL(client.authorizationUrl({ state: 'estado-aleatorio' }));

        expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
        expect(url.searchParams.get('client_id')).toBe(CONFIG.clientId);
        expect(url.searchParams.get('redirect_uri')).toBe(CONFIG.redirectUri);
        expect(url.searchParams.get('response_type')).toBe('code');
        expect(url.searchParams.get('state')).toBe('estado-aleatorio');
        expect(url.searchParams.get('access_type')).toBe('offline');
        expect(url.searchParams.get('scope')?.split(' ').sort()).toEqual([...REQUIRED_YOUTUBE_SCOPES].sort());
        // Sin `consent`, Google no reemite el token de actualización a quien ya autorizó.
        expect(url.searchParams.get('prompt')?.split(' ')).toContain('consent');
    });

    it('deja elegir la cuenta: el canal puede estar en una cuenta de marca', () => {
        const { client } = build();

        const url = new URL(client.authorizationUrl({ state: 's' }));

        expect(url.searchParams.get('prompt')?.split(' ')).toContain('select_account');
    });

    it('no incluye el secreto de la aplicación y codifica el state', () => {
        const { client } = build();

        const raw = client.authorizationUrl({ state: 'a&b=c d' });

        expect(raw).not.toContain(CONFIG.clientSecret);
        expect(new URL(raw).searchParams.get('state')).toBe('a&b=c d');
    });
});

describe('YouTubeConnectionOAuthClient.exchangeCode', () => {
    it('canjea el código y devuelve los tokens y los permisos otorgados', async () => {
        const { client, fetchImpl } = build();
        fetchImpl.mockResolvedValue(json(tokenResponse()));

        const tokens = await client.exchangeCode({ code: 'codigo-secreto' });

        expect(tokens).toEqual({
            accessToken: 'ya29.acceso-secreto',
            refreshToken: '1//refresco-secreto',
            grantedScopes: [...REQUIRED_YOUTUBE_SCOPES],
        });
        const [url, init] = fetchImpl.mock.calls[0];
        expect(String(url)).toBe('https://oauth2.googleapis.com/token');
        expect(init?.method).toBe('POST');
        const body = new URLSearchParams(String(init?.body));
        expect(body.get('grant_type')).toBe('authorization_code');
        expect(body.get('code')).toBe('codigo-secreto');
        expect(body.get('client_id')).toBe(CONFIG.clientId);
        expect(body.get('client_secret')).toBe(CONFIG.clientSecret);
        expect(body.get('redirect_uri')).toBe(CONFIG.redirectUri);
    });

    it('informa solo los permisos que Google dice haber otorgado', async () => {
        const { client, fetchImpl } = build();
        fetchImpl.mockResolvedValue(json(tokenResponse({ scope: REQUIRED_YOUTUBE_SCOPES[0] })));

        const tokens = await client.exchangeCode({ code: 'c' });

        expect(tokens.grantedScopes).toEqual([REQUIRED_YOUTUBE_SCOPES[0]]);
    });

    it('sin token de actualización lo deja ausente en vez de inventarlo', async () => {
        const { client, fetchImpl } = build();
        fetchImpl.mockResolvedValue(json(tokenResponse({ refresh_token: undefined })));

        const tokens = await client.exchangeCode({ code: 'c' });

        expect(tokens.refreshToken).toBeUndefined();
    });

    it('un rechazo de Google (código inválido o vencido) es un error común, no de servicio', async () => {
        const { client, fetchImpl } = build();
        fetchImpl.mockResolvedValue(
            json({ error: 'invalid_grant', error_description: 'Bad code=codigo-secreto' }, 400),
        );

        const error = await client.exchangeCode({ code: 'codigo-secreto' }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(ServiceUnavailableError);
        expectNoSecrets(error);
    });

    it.each([500, 502, 503, 429])('una respuesta %i es una falla del servicio de Google', async (status) => {
        const { client, fetchImpl } = build();
        fetchImpl.mockResolvedValue(json({ error: 'backend', detail: 'codigo-secreto' }, status));

        const error = await client.exchangeCode({ code: 'codigo-secreto' }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ServiceUnavailableError);
        expectNoSecrets(error);
    });

    it('un error de red o un tiempo agotado es una falla del servicio, sin la causa original', async () => {
        const { client, fetchImpl } = build();
        fetchImpl.mockRejectedValue(new Error('connect ECONNREFUSED body=codigo-secreto&client_secret=SECRETO-DE-LA-APP'));

        const error = await client.exchangeCode({ code: 'codigo-secreto' }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ServiceUnavailableError);
        expectNoSecrets(error);
    });

    it('una respuesta ilegible o sin token de acceso es una falla del servicio', async () => {
        const { client, fetchImpl } = build();

        fetchImpl.mockResolvedValueOnce(new Response('<html>caído</html>', { status: 200 }));
        await expect(client.exchangeCode({ code: 'c' })).rejects.toBeInstanceOf(ServiceUnavailableError);

        fetchImpl.mockResolvedValueOnce(json(tokenResponse({ access_token: '' })));
        await expect(client.exchangeCode({ code: 'c' })).rejects.toBeInstanceOf(ServiceUnavailableError);
    });
});
