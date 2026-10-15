import { describe, it, expect } from 'vitest';
import {
    DNS_DELAYED_AFTER_ATTEMPTS,
    DNS_POLL_INTERVAL_MS,
    DNS_POLL_MAX_ATTEMPTS,
    dnsCheckStatus,
} from '@/lib/dnsCheckStatus';

/**
 * Qué le dice el diálogo al vendedor mientras espera el registro. El tope de
 * intentos acota cuánto consulta: 30 cada 10 segundos son unos 5 minutos.
 */

const idle = { verified: false, attempts: 0, checking: false };

describe('dnsCheckStatus', () => {
    it('el tope es de unos 5 minutos', () => {
        expect(DNS_POLL_INTERVAL_MS * DNS_POLL_MAX_ATTEMPTS).toBe(300_000);
    });

    it('al principio lo está buscando', () => {
        expect(dnsCheckStatus(idle)).toBe('searching');
    });

    it('mientras consulta sigue buscando, aunque ya lleve varios intentos', () => {
        expect(dnsCheckStatus({ ...idle, attempts: DNS_DELAYED_AFTER_ATTEMPTS + 1, checking: true })).toBe('searching');
    });

    it('después de unos intentos sin verlo avisa que puede tardar', () => {
        expect(dnsCheckStatus({ ...idle, attempts: DNS_DELAYED_AFTER_ATTEMPTS })).toBe('delayed');
    });

    it('al llegar al tope deja de buscar y pide avisar cuando esté cargado', () => {
        expect(dnsCheckStatus({ ...idle, attempts: DNS_POLL_MAX_ATTEMPTS })).toBe('stopped');
    });

    it('si lo encuentra, está verificado, sin importar los intentos', () => {
        expect(dnsCheckStatus({ ...idle, verified: true, attempts: DNS_POLL_MAX_ATTEMPTS })).toBe('verified');
    });

    it('un error de la comprobación se muestra como error', () => {
        expect(dnsCheckStatus({ ...idle, error: 'No disponible', attempts: 1 })).toBe('error');
    });
});
