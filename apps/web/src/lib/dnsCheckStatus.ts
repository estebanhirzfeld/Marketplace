/** Cada cuánto consulta el diálogo mientras está abierto. */
export const DNS_POLL_INTERVAL_MS = 10_000;
/** Cuántas consultas hace como máximo: 30 cada 10 segundos son unos 5 minutos. */
export const DNS_POLL_MAX_ATTEMPTS = 30;
/** Desde qué intento deja de decir «lo estamos buscando» y avisa que puede tardar. */
export const DNS_DELAYED_AFTER_ATTEMPTS = 3;

export type DnsCheckStatus = 'searching' | 'delayed' | 'stopped' | 'verified' | 'error';

/**
 * Qué le dice el diálogo al vendedor mientras espera el registro. Una consulta
 * en curso siempre se muestra como búsqueda: el aviso de demora es del reposo
 * entre consultas, no de mientras se espera la respuesta.
 */
export function dnsCheckStatus({
    verified,
    error,
    attempts,
    checking,
}: {
    verified: boolean;
    error?: string;
    attempts: number;
    checking: boolean;
}): DnsCheckStatus {
    if (verified) return 'verified';
    if (error) return 'error';
    if (checking) return 'searching';
    if (attempts >= DNS_POLL_MAX_ATTEMPTS) return 'stopped';
    if (attempts >= DNS_DELAYED_AFTER_ATTEMPTS) return 'delayed';
    return 'searching';
}
