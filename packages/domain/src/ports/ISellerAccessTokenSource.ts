/**
 * De dónde sale un token de acceso válido para operar a nombre de un vendedor.
 *
 * Lo implementa `GetSellerAccessTokenUseCase`. Existe como puerto para que el
 * cobro con split dependa de "dame un token" y no de cómo se guarda, se vence
 * o se renueva.
 *
 * Contrato de errores: `NotFoundError` si el vendedor no vinculó su cuenta e
 * `InvalidStateError` si el token no se pudo obtener o renovar.
 */
export interface ISellerAccessTokenSource {
    execute(userId: string): Promise<string>;
}
