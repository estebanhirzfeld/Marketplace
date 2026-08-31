import type { ListingStatusDto } from '@marketplace/api-contract';

const ESTADOS: Record<ListingStatusDto, { text: string; clase: string }> = {
    draft: { text: 'BORRADOR', clase: 'text-[var(--color-apagado)] border-[var(--color-borde)]' },
    under_review: { text: 'EN REVISIÓN', clase: 'text-[var(--color-alerta)] border-[var(--color-alerta)]/40' },
    published: { text: 'PUBLICADO', clase: 'text-[var(--color-acento)] border-[var(--color-acento)]/50' },
    in_operation: { text: 'EN OPERACIÓN', clase: 'text-[var(--color-tinta)] border-[var(--color-borde-fuerte)]' },
    sold: { text: 'VENDIDO', clase: 'text-[var(--color-acento)] border-[var(--color-acento)]' },
    rejected: { text: 'RECHAZADO', clase: 'text-[var(--color-error)] border-[var(--color-error)]/40' },
};

export function ListingStatusBadge({ state }: { state: ListingStatusDto }) {
    const e = ESTADOS[state];
    return (
        <span className={`rounded-[var(--radius-chico)] border px-2.5 py-1 font-mono text-[11px] tracking-[0.08em] ${e.clase}`}>
            {e.text}
        </span>
    );
}
