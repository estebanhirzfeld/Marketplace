/**
 * Qué campos de los datos publicados se dibujan.
 *
 * Un campo se oculta si es interno, si no vino en los datos o si figura en la
 * lista de exclusión (lo que otra tarjeta de la misma pantalla ya muestra).
 */
export function visibleFields<F extends { key: string; internal?: boolean }>(
    fields: readonly F[],
    data: Record<string, unknown>,
    exclude: readonly string[] = [],
): F[] {
    return fields.filter((f) => f.key in data && !f.internal && !exclude.includes(f.key));
}

/** Lo que la tarjeta del canal de YouTube ya muestra, para no repetirlo abajo. */
export const YOUTUBE_CARD_FIELD_KEYS: readonly string[] = [
    'subscribers',
    'monthlyRevenueUsdCents',
    'isMonetized',
    'audienceTopCountry',
    'name',
    'verifiedFromYouTubeAt',
];
