/**
 * Lo que la pantalla de venta dice sobre cómo se publica un borrador. Depende
 * del tipo de activo: un sitio se publica directo cuando el vendedor comprueba
 * el dominio con un registro DNS (la revisión es la alternativa); un canal
 * pasa por revisión.
 */
export function listingDraftNotice(assetType: 'web' | 'youtube'): string {
    return assetType === 'web'
        ? 'Se guarda como borrador. Para publicarlo comprobás que el sitio es tuyo con un registro en tu DNS; si no podés, lo enviás a revisión y en ese momento te pedimos el acceso al sitio.'
        : 'Se guarda como borrador. Al enviarlo a revisión lo evaluamos antes de publicarlo, y en ese momento te pedimos el acceso al activo.';
}
