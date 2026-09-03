/**
 * Interruptor de indexado por buscadores.
 *
 * Una sola variable de entorno, `SEARCH_INDEXING`, gobierna si el sitio se
 * ofrece a los buscadores. Por decisión del usuario **arranca en indexable**:
 * solo se apaga con un valor explícitamente negativo, y volver a activarlo es
 * cambiar la variable — sin editar ni redeployar código.
 */

const NEGATIVE_VALUES = new Set(['false', '0', 'off', 'no']);

/** `true` salvo que la variable traiga un valor explícitamente negativo. */
export function isSearchIndexingEnabled(
    value: string | undefined = process.env.SEARCH_INDEXING,
): boolean {
    if (value === undefined) return true;
    return !NEGATIVE_VALUES.has(value.trim().toLowerCase());
}

type RobotsRule =
    | { userAgent: string; allow: string }
    | { userAgent: string; disallow: string };

/** Reglas para `app/robots.ts`. */
export function robotsRules(enabled: boolean = isSearchIndexingEnabled()): RobotsRule {
    return enabled
        ? { userAgent: '*', allow: '/' }
        : { userAgent: '*', disallow: '/' };
}

/** Directiva `robots` para el metadata de Next. */
export function robotsMetadata(
    enabled: boolean = isSearchIndexingEnabled(),
): { index: boolean; follow: boolean } {
    return { index: enabled, follow: enabled };
}
