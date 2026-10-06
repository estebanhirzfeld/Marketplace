import {
    IMercadoPagoOAuthClient,
    MercadoPagoTokens,
} from '@marketplace/domain/src/ports/IMercadoPagoOAuthClient';

const AUTH_ENDPOINT = 'https://auth.mercadopago.com.ar/authorization';
const TOKEN_ENDPOINT = 'https://api.mercadopago.com/oauth/token';
const DEFAULT_TIMEOUT_MS = 8_000;

export interface MercadoPagoOAuthConfig {
    /** El número de la aplicación de Mercado Pago. */
    clientId: string;
    clientSecret: string;
    /** Debe estar registrada en la aplicación y coincidir letra por letra. */
    redirectUri: string;
    timeoutMs?: number;
}

/**
 * OAuth de Mercado Pago con PKCE: el vendedor autoriza una vez y la plataforma
 * cobra a su nombre con el token que recibe.
 *
 * Ningún mensaje de error incluye el cuerpo de la respuesta ni los datos del
 * pedido: ahí viajan el secreto de la aplicación, el código, el verificador y
 * los tokens.
 */
export class MercadoPagoOAuthClient implements IMercadoPagoOAuthClient {
    constructor(
        private readonly config: MercadoPagoOAuthConfig,
        private readonly fetchImpl: typeof fetch = fetch,
    ) {}

    /** El `state` y el desafío los genera quien arma el pedido; acá solo se incorporan. */
    authorizationUrl(params: { state: string; codeChallenge: string }): string {
        const url = new URL(AUTH_ENDPOINT);
        url.searchParams.set('client_id', this.config.clientId);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('platform_id', 'mp');
        url.searchParams.set('state', params.state);
        url.searchParams.set('redirect_uri', this.config.redirectUri);
        url.searchParams.set('code_challenge', params.codeChallenge);
        url.searchParams.set('code_challenge_method', 'S256');
        return url.toString();
    }

    exchangeCode(params: { code: string; codeVerifier: string }): Promise<MercadoPagoTokens> {
        return this.requestTokens({
            grant_type: 'authorization_code',
            code: params.code,
            code_verifier: params.codeVerifier,
            redirect_uri: this.config.redirectUri,
        });
    }

    refresh(refreshToken: string): Promise<MercadoPagoTokens> {
        return this.requestTokens({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        });
    }

    private async requestTokens(grant: Record<string, string>): Promise<MercadoPagoTokens> {
        let respuesta: Response;
        try {
            respuesta = await this.fetchImpl(TOKEN_ENDPOINT, {
                method: 'POST',
                headers: { 'content-type': 'application/json', accept: 'application/json' },
                body: JSON.stringify({
                    client_id: this.config.clientId,
                    client_secret: this.config.clientSecret,
                    ...grant,
                }),
                signal: AbortSignal.timeout(this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
            });
        } catch {
            // El error de red puede arrastrar la dirección o el cuerpo del pedido.
            throw new Error('No se pudo comunicar con Mercado Pago para la autorización.');
        }

        if (!respuesta.ok) {
            // El cuerpo del error puede repetir lo que mandamos: no se propaga.
            throw new Error(`Mercado Pago rechazó el pedido de autorización (${respuesta.status}).`);
        }

        let cuerpo: unknown;
        try {
            cuerpo = await respuesta.json();
        } catch {
            throw new Error('Mercado Pago devolvió una respuesta de autorización ilegible.');
        }

        return aTokens(cuerpo);
    }
}

/** Valida la forma de la respuesta antes de que algo la use. */
function aTokens(cuerpo: unknown): MercadoPagoTokens {
    const c = (typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}) as Record<string, unknown>;

    const accessToken = c.access_token;
    const refreshToken = c.refresh_token;
    const expiresIn = c.expires_in;
    const userId = c.user_id;
    const scope = c.scope;

    const idValido =
        (typeof userId === 'number' && Number.isFinite(userId) && userId > 0) ||
        (typeof userId === 'string' && userId.trim() !== '');

    if (
        !esTextoNoVacio(accessToken) ||
        !esTextoNoVacio(refreshToken) ||
        !esTextoNoVacio(scope) ||
        typeof expiresIn !== 'number' ||
        !Number.isFinite(expiresIn) ||
        expiresIn <= 0 ||
        !idValido
    ) {
        throw new Error('Mercado Pago devolvió una respuesta de autorización inválida.');
    }

    return {
        accessToken,
        refreshToken,
        expiresInSeconds: expiresIn,
        mpUserId: String(userId),
        scope,
    };
}

function esTextoNoVacio(valor: unknown): valor is string {
    return typeof valor === 'string' && valor.trim() !== '';
}
