import type { ListingStatusDto } from '@marketplace/api-contract';

const ESTADOS: Record<ListingStatusDto, { texto: string; clase: string }> = {
    draft: { texto: 'BORRADOR', clase: 'text-[var(--color-apagado)] border-[var(--color-borde)]' },
    under_review: { texto: 'EN REVISIÓN', clase: 'text-[var(--color-alerta)] border-[var(--color-alerta)]/40' },
    published: { texto: 'PUBLICADO', clase: 'text-[var(--color-acento)] border-[var(--color-acento)]/50' },
    in_operation: { texto: 'EN OPERACIÓN', clase: 'text-[var(--color-tinta)] border-[var(--color-borde-fuerte)]' },
    sold: { texto: 'VENDIDO', clase: 'text-[var(--color-acento)] border-[var(--color-acento)]' },
    rejected: { texto: 'RECHAZADO', clase: 'text-[var(--color-error)] border-[var(--color-error)]/40' },
};

export function EstadoListing({ estado }: { estado: ListingStatusDto }) {
    const e = ESTADOS[estado];
    return (
        <span className={`rounded-[var(--radius-chico)] border px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] ${e.clase}`}>
            {e.texto}
        </span>
    );
}
