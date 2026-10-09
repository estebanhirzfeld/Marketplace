import { ValidationError } from '../errors/DomainError';

/** Los permisos de Google que la plataforma pide al conectar un canal. */
export const YOUTUBE_SCOPE = {
    /** Ver el canal: identidad y suscriptores. */
    CHANNEL: 'https://www.googleapis.com/auth/youtube.readonly',
    /** Estadísticas del canal: vistas, suscriptores ganados y perdidos, país. */
    ANALYTICS: 'https://www.googleapis.com/auth/yt-analytics.readonly',
    /** Estadísticas de ingresos: es el dato que fija el precio. */
    REVENUE: 'https://www.googleapis.com/auth/yt-analytics-monetary.readonly',
} as const;

/**
 * Los tres son obligatorios y todos son de solo lectura. Sin cualquiera de
 * ellos la plataforma no puede verificar lo que el vendedor publica, así que
 * conectar con menos no es una opción degradada: es no conectar.
 */
export const REQUIRED_YOUTUBE_SCOPES: readonly string[] = [
    YOUTUBE_SCOPE.CHANNEL,
    YOUTUBE_SCOPE.ANALYTICS,
    YOUTUBE_SCOPE.REVENUE,
];

/** Cómo se nombra cada permiso ante el vendedor. */
const DESCRIPTION: Readonly<Record<string, string>> = {
    [YOUTUBE_SCOPE.CHANNEL]: 'ver tu canal',
    [YOUTUBE_SCOPE.ANALYTICS]: 'las estadísticas',
    [YOUTUBE_SCOPE.REVENUE]: 'las estadísticas de ingresos',
};

/**
 * Los permisos obligatorios que NO figuran entre los otorgados, en el orden de
 * `REQUIRED_YOUTUBE_SCOPES`. Los permisos de más se ignoran.
 */
export function missingYouTubeScopes(granted: readonly string[]): string[] {
    const grantedSet = new Set(granted);
    return REQUIRED_YOUTUBE_SCOPES.filter((scope) => !grantedSet.has(scope));
}

/**
 * El vendedor no otorgó todos los permisos obligatorios. Es un error de
 * validación (400): se corrige volviendo a conectar y dejando los permisos
 * tildados. Lleva la lista para que el transporte pueda mostrarla.
 */
export class MissingYouTubeScopesError extends ValidationError {
    constructor(public readonly missing: string[]) {
        super(
            `Para publicar tu canal necesitamos que nos dejes ${joinList(missing.map((s) => DESCRIPTION[s] ?? s))}. ` +
            'Volvé a conectar y dejá todos los permisos tildados: solo leemos, no podemos publicar ni borrar nada.',
        );
    }
}

function joinList(items: string[]): string {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}
