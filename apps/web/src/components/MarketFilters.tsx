import Link from 'next/link';
import type { ListingFiltersQuery } from '@marketplace/api-contract';

const TIPOS = [
    { value: undefined, text: 'TODOS' },
    { value: 'youtube', text: 'YOUTUBE' },
    { value: 'web', text: 'WEB' },
    { value: 'instagram', text: 'INSTAGRAM' },
    { value: 'tiktok', text: 'TIKTOK' },
] as const;

const RANGOS = [
    { text: 'CUALQUIER PRECIO', min: undefined, max: undefined },
    { text: 'HASTA 5K', min: undefined, max: 500_000 },
    { text: '5K – 20K', min: 500_000, max: 2_000_000 },
    { text: 'MÁS DE 20K', min: 2_000_000, max: undefined },
] as const;

function href(filtros: ListingFiltersQuery): string {
    const q = new URLSearchParams();
    if (filtros.assetType) q.set('assetType', filtros.assetType);
    if (filtros.minPrice !== undefined) q.set('minPrice', String(filtros.minPrice));
    if (filtros.maxPrice !== undefined) q.set('maxPrice', String(filtros.maxPrice));
    return q.toString() === '' ? '/listings' : `/listings?${q.toString()}`;
}

/**
 * Los filtros son enlaces, no un formulario cliente: cada combinación tiene su
 * propia URL, así que se comparte, se indexa y funciona sin JavaScript.
 */
export function MarketFilters({ actuales }: { actuales: ListingFiltersQuery }) {
    const chip = (asset: boolean) =>
        `rounded-[var(--radius-chico)] border px-3.5 py-1.5 font-mono text-[11px] tracking-[0.06em] transition-colors ${
            asset
                ? 'border-[var(--color-acento)] text-[var(--color-acento)]'
                : 'border-[var(--color-borde-fuerte)] text-[var(--color-apagado)] hover:text-[var(--color-tinta)]'
        }`;

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
                {TIPOS.map((t) => (
                    <Link
                        key={t.text}
                        href={href({ ...actuales, assetType: t.value })}
                        className={chip(actuales.assetType === t.value)}
                    >
                        {t.text}
                    </Link>
                ))}
            </div>

            <div className="flex flex-wrap gap-2">
                {RANGOS.map((r) => (
                    <Link
                        key={r.text}
                        href={href({ assetType: actuales.assetType, minPrice: r.min, maxPrice: r.max })}
                        className={chip(actuales.minPrice === r.min && actuales.maxPrice === r.max)}
                    >
                        {r.text}
                    </Link>
                ))}
            </div>
        </div>
    );
}
