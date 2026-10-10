/**
 * Cómo terminó la verificación de titularidad con Google, tal como vuelve en
 * `?verificacion=`. La vuelta se resuelve en un route handler que redirige, así
 * que el resultado viaja en la dirección y lo cuentan las pantallas.
 */
export const OWNERSHIP_RESULTS: Record<string, { text: string; ok: boolean }> = {
    ok: { text: 'Listo: quedó comprobado que controlás el activo.', ok: true },
    'sin-control': {
        text: 'Esa cuenta de Google no controla el activo que publicaste. Si es un canal con Cuenta de Marca, elegila al iniciar sesión.',
        ok: false,
    },
    cancelada: { text: 'Cancelaste la verificación. Podés volver a intentarla cuando quieras.', ok: false },
    'no-configurada': { text: 'La verificación con Google todavía no está configurada.', ok: false },
    invalida: { text: 'No pudimos identificar qué activo se estaba verificando.', ok: false },
    error: { text: 'No pudimos completar la verificación. Probá de nuevo.', ok: false },
};
