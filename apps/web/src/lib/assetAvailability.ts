/**
 * Qué tipos de activo se pueden publicar hoy.
 *
 * La venta de sitios web está en pausa (22/10/2026): el dominio se pone en
 * custodia, pero el sitio en sí (hosting, código, base de datos) todavía no
 * tiene una entrega comprobable. Lo investigado está en
 * `odd/tasks/entrega-de-un-sitio.md`. El código de sitios queda; solo se
 * cierra la entrada.
 */
export const WEBSITE_SALES_ENABLED = false;

export type SellableAssetType = 'youtube' | 'web';

export function sellableAssetTypes(): SellableAssetType[] {
    return WEBSITE_SALES_ENABLED ? ['youtube', 'web'] : ['youtube'];
}
