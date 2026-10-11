/**
 * El rayo del acceso de administración, con el mismo barrido de luz que la
 * etiqueta «TRANSFERENCIA INMEDIATA»: las dos cosas son una sola promesa.
 * El brillo es CSS puro (`.brillo-acento` sobre una máscara) y se apaga con
 * `prefers-reduced-motion`.
 */
export function ShimmerBolt({ size = 32 }: { size?: number }) {
    return (
        <span
            aria-hidden="true"
            className="rayo-brillante brillo-acento"
            style={{ width: size, height: size }}
        />
    );
}

/** La etiqueta de transferencia inmediata con el barrido de luz. */
export function ImmediateBadge({ className = '' }: { className?: string }) {
    return (
        <span
            className={`brillo-acento self-start rounded-[var(--radius-chico)] px-2.5 py-1.5 font-mono text-[12px] font-medium tracking-[0.06em] text-[var(--color-fondo)] ${className}`}
        >
            TRANSFERENCIA INMEDIATA
        </span>
    );
}
