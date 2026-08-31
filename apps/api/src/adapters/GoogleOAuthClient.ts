/**
 * Canje del código de autorización de Google por un token de acceso.
 *
 * Deliberadamente pide `access_type=online` y nunca guarda nada: la
 * verificación es una foto, no una suscripción. El vendedor autoriza, hacemos
 * una llamada y el token se descarta. Como consecuencia no hay credenciales de
 * terceros en reposo —no hay nada que filtrar ni que rotar— y la expiración de
 * siete días que Google impone a las apps en modo de prueba deja de importar,
 * porque el token vive segundos.
 */

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

export interface GoogleOAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

export class GoogleOAuthClient {
    constructor(
        private readonly config: GoogleOAuthConfig,
        private readonly fetchImpl: typeof fetch = fetch,
    ) {}

    /**
     * La dirección a la que se manda al vendedor para que autorice.
     *
     * `state` viaja de ida y vuelta sin que Google lo toque: sirve para saber,
     * al volver, de qué listing se trataba y que el pedido salió de nosotros.
     */
    authorizationUrl(scope: string, state: string): string {
        const url = new URL(AUTH_ENDPOINT);
        url.searchParams.set('client_id', this.config.clientId);
        url.searchParams.set('redirect_uri', this.config.redirectUri);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('scope', scope);
        url.searchParams.set('state', state);
        // Sin refresh token: no queremos poder volver a llamar sin el vendedor.
        url.searchParams.set('access_type', 'online');
        // Que la cuenta se elija siempre: un canal puede estar bajo una Cuenta
        // de Marca distinta de la sesión abierta en el navegador.
        url.searchParams.set('prompt', 'select_account consent');
        return url.toString();
    }

    /** Canjea el código por un token de acceso de un solo uso. */
    async exchange(code: string): Promise<string> {
        const respuesta = await this.fetchImpl(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                redirect_uri: this.config.redirectUri,
                grant_type: 'authorization_code',
            }).toString(),
        });

        if (!respuesta.ok) {
            // El cuerpo del error puede traer el secreto: no se propaga.
            throw new Error(`Google rechazó el código de autorización (${respuesta.status}).`);
        }

        const cuerpo = (await respuesta.json()) as { access_token?: unknown };
        if (typeof cuerpo.access_token !== 'string' || cuerpo.access_token === '') {
            throw new Error('Google no devolvió un token de acceso.');
        }

        return cuerpo.access_token;
    }
}

export const SCOPE_YOUTUBE = 'https://www.googleapis.com/auth/youtube.readonly';
export const SCOPE_ADSENSE = 'https://www.googleapis.com/auth/adsense.readonly';
