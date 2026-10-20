/**
 * Lo que entrega Google al canjear el código de la conexión de un canal.
 *
 * Los permisos otorgados vienen aparte de los pedidos: el vendedor puede
 * destildar alguno en la pantalla de Google.
 */
export interface YouTubeConnectionTokens {
    accessToken: string;
    /**
     * Ausente si Google no emitió uno (por ejemplo, si el vendedor ya había
     * autorizado y el pedido no forzó el consentimiento). Sin él no hay forma
     * de volver a leer el canal después.
     */
    refreshToken?: string;
    grantedScopes: string[];
}

/**
 * Puerto del OAuth de Google para CONECTAR un canal (acceso `offline`).
 *
 * Es distinto del lector de titularidad (`IYouTubeOwnershipReader`), que usa
 * el permiso una sola vez y descarta todo: acá el token de actualización se
 * conserva, cifrado, para leer el canal de nuevo.
 */
export interface IYouTubeConnectionOAuthClient {
    /** La dirección a la que se manda al vendedor; pide los tres permisos y `offline`. */
    authorizationUrl(params: { state: string }): string;
    /** Canjea el código (de un solo uso) por los tokens y los permisos otorgados. */
    exchangeCode(params: { code: string }): Promise<YouTubeConnectionTokens>;
}
