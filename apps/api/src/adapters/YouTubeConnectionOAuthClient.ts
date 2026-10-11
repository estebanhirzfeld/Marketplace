import {
    IYouTubeConnectionOAuthClient,
    YouTubeConnectionTokens,
} from '@marketplace/domain/src/ports/IYouTubeConnectionOAuthClient';
import { REQUIRED_YOUTUBE_SCOPES } from '@marketplace/domain/src/value-objects/YouTubeScopes';
import { ServiceUnavailableError } from '@marketplace/domain/src/errors/DomainError';
import { fetchOrUnavailable, isTransientStatus } from './googleHttp';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export interface YouTubeConnectionOAuthConfig {
    clientId: string;
    clientSecret: string;
    /** Debe estar registrada en la consola de Google y coincidir letra por letra. */
    redirectUri: string;
}

/**
 * OAuth de Google para CONECTAR un canal: a diferencia de `GoogleOAuthClient`
 * (la verificación de titularidad, `online` y descartable), acá se pide acceso
 * `offline` para conservar el token de actualización cifrado y volver a leer
 * el canal sin otra autorización.
 *
 * Distingue dos clases de falla al canjear el código:
 *  - Google lo rechazó (inválido, vencido, ya usado): `Error` común, que el
 *    caso de uso traduce a "probá de nuevo";
 *  - Google no pudo responder (red, 5xx, cuota): `ServiceUnavailableError`.
 * Ningún mensaje incluye el cuerpo de la respuesta ni los datos del pedido:
 * ahí viajan el secreto de la aplicación, el código y los tokens.
 */
export class YouTubeConnectionOAuthClient implements IYouTubeConnectionOAuthClient {
    constructor(
        private readonly config: YouTubeConnectionOAuthConfig,
        private readonly fetchImpl: typeof fetch = fetch,
    ) {}

    /** El `state` lo genera quien arma el pedido (la capa web); acá solo se incorpora. */
    authorizationUrl(params: { state: string }): string {
        const url = new URL(AUTH_ENDPOINT);
        url.searchParams.set('client_id', this.config.clientId);
        url.searchParams.set('redirect_uri', this.config.redirectUri);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('scope', REQUIRED_YOUTUBE_SCOPES.join(' '));
        url.searchParams.set('state', params.state);
        // Sin `offline` no hay token de actualización y no se puede volver a leer.
        url.searchParams.set('access_type', 'offline');
        // `consent` fuerza a Google a reemitir el token de actualización aunque
        // el vendedor ya haya autorizado; `select_account` deja elegir la cuenta
        // porque el canal puede estar bajo una Cuenta de Marca distinta de la
        // sesión abierta en el navegador.
        url.searchParams.set('prompt', 'select_account consent');
        return url.toString();
    }

    async exchangeCode(params: { code: string }): Promise<YouTubeConnectionTokens> {
        const response = await fetchOrUnavailable(
            this.fetchImpl,
            TOKEN_ENDPOINT,
            {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code: params.code,
                    client_id: this.config.clientId,
                    client_secret: this.config.clientSecret,
                    redirect_uri: this.config.redirectUri,
                    grant_type: 'authorization_code',
                }).toString(),
            },
            'No se pudo comunicar con Google para conectar el canal.',
        );

        if (isTransientStatus(response.status)) {
            throw new ServiceUnavailableError(`Google no pudo procesar la autorización (${response.status}).`);
        }
        if (!response.ok) {
            // El cuerpo del error puede repetir lo que mandamos: no se propaga.
            throw new Error(`Google rechazó el código de autorización (${response.status}).`);
        }

        let body: unknown;
        try {
            body = await response.json();
        } catch {
            throw new ServiceUnavailableError('Google devolvió una respuesta de autorización ilegible.');
        }
        return toTokens(body);
    }
}

/** Valida la forma de la respuesta antes de que algo la use. */
function toTokens(body: unknown): YouTubeConnectionTokens {
    const b: Record<string, unknown> =
        typeof body === 'object' && body !== null ? Object.fromEntries(Object.entries(body)) : {};

    if (typeof b.access_token !== 'string' || b.access_token.trim() === '') {
        throw new ServiceUnavailableError('Google no devolvió un token de acceso.');
    }

    return {
        accessToken: b.access_token,
        ...(typeof b.refresh_token === 'string' && b.refresh_token.trim() !== ''
            ? { refreshToken: b.refresh_token }
            : {}),
        // Los permisos vienen separados por espacios; pueden ser menos que los pedidos.
        grantedScopes: typeof b.scope === 'string' ? b.scope.split(' ').filter((s) => s !== '') : [],
    };
}
