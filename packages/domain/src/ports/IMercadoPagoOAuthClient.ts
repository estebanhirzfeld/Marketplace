/**
 * Los datos que entrega Mercado Pago al canjear o renovar una autorización.
 *
 * `mpUserId` viaja como texto: el identificador es un número largo y el
 * dominio no hace cuentas con él.
 */
export interface MercadoPagoTokens {
    accessToken: string;
    refreshToken: string;
    /** Cuánto dura el token de acceso desde que se emitió, en segundos. */
    expiresInSeconds: number;
    mpUserId: string;
    scope: string;
}

/**
 * Puerto del OAuth de Mercado Pago (authorization_code con PKCE).
 *
 * El `state` y el par PKCE los genera quien arma el pedido (la capa web); el
 * puerto solo los incorpora al destino y recibe el verificador al canjear.
 * Mercado Pago ROTA el token de renovación en cada uso: el anterior deja de
 * funcionar, así que quien llame a `refresh` tiene que guardar el nuevo.
 */
export interface IMercadoPagoOAuthClient {
    /** La dirección a la que se manda al vendedor para que autorice. */
    authorizationUrl(params: { state: string; codeChallenge: string }): string;
    /** Canjea el código (vale 10 minutos y es de un solo uso) por los tokens. */
    exchangeCode(params: { code: string; codeVerifier: string }): Promise<MercadoPagoTokens>;
    /** Renueva con el token de renovación; devuelve un token de renovación nuevo. */
    refresh(refreshToken: string): Promise<MercadoPagoTokens>;
}
