import { fechaLarga } from '@/lib/format';

/**
 * El sello de un dato que no escribió el vendedor: lo leyó la plataforma de la
 * fuente, en una fecha. La fecha es parte del sello porque es una foto, no una
 * garantía hacia adelante: el comprador tiene que poder ver qué tan vieja es.
 */
export function VerificationSeal({ source, at }: { source: string; at: string }) {
    return (
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.04em] text-[var(--color-listo)]">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M2 6.5 4.8 9 10 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Verificado con {source} · {fechaLarga(at)}
        </span>
    );
}
