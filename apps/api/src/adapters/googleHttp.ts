import { ServiceUnavailableError } from '@marketplace/domain/src/errors/DomainError';

/** Cuánto se espera a Google antes de darlo por caído. */
export const GOOGLE_TIMEOUT_MS = 8_000;

/**
 * Los códigos con los que Google dice "ahora no": 429 y 5xx. Reintentar más
 * tarde puede funcionar y no depende de lo que haya hecho el vendedor.
 */
export function isTransientStatus(status: number): boolean {
    return status === 429 || status >= 500;
}

/**
 * Los motivos de un 403 que son cuota o límite de velocidad, no falta de
 * permiso. Vienen en `error.errors[].reason` del cuerpo de error de Google.
 */
const QUOTA_REASONS = new Set([
    'quotaExceeded',
    'rateLimitExceeded',
    'userRateLimitExceeded',
    'dailyLimitExceeded',
    'limitExceeded',
]);

/** Si el cuerpo de un error de Google dice que se agotó la cuota. Nunca lanza. */
export async function isQuotaError(response: Response): Promise<boolean> {
    try {
        const body: unknown = await response.clone().json();
        const error = asRecord(asRecord(body)?.error);
        const errors = Array.isArray(error?.errors) ? error.errors : [];
        return errors.some((entry) => {
            const reason = asRecord(entry)?.reason;
            return typeof reason === 'string' && QUOTA_REASONS.has(reason);
        });
    } catch {
        return false;
    }
}

/**
 * Hace el pedido y traduce red caída o tiempo agotado a "servicio no
 * disponible". El error original puede arrastrar la dirección o el cuerpo del
 * pedido (códigos, secretos, tokens): no se propaga.
 */
export async function fetchOrUnavailable(
    fetchImpl: typeof fetch,
    url: string,
    init: RequestInit,
    message: string,
): Promise<Response> {
    try {
        return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) });
    } catch {
        throw new ServiceUnavailableError(message);
    }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null
        ? Object.fromEntries(Object.entries(value))
        : undefined;
}
