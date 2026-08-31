import Link from 'next/link';
import type { ListingSummaryDto } from '@marketplace/api-contract';
import { LockIcon } from './LockIcon';
import { TransferableBadge } from './Transferability';
import { money, assetTypeLabel, cardMetrics } from '@/lib/format';

export function ListingCard({
    listing,
    offers,
}: {
    listing: ListingSummaryDto;
    offers?: number;
}) {
    const metrics = cardMetrics(listing.assetType, listing.assetData);
    const [title, ...rows] = metrics;

    return (
        <Link
            href={`/listings/${listing.id}`}
            className="flex h-full flex-col gap-4 rounded-[var(--radius-medio)] border border-[var(--color-borde)] bg-[var(--color-superficie)] p-5 transition-[transform,border-color] duration-500 [transition-timing-function:var(--ease-rebote)] hover:-translate-y-1 hover:border-[var(--color-borde-fuerte)]"
        >
            {/* El sello de NDA que había acá se fue: todos los activos se
                publican blindados, sin excepción, así que marcarlo en las seis
                tarjetas de la grilla no distinguía ninguna. Lo que sí informa
                —cuántos datos faltan— quedó abajo, una sola vez. */}
            <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] tracking-[0.1em] text-[var(--color-apagado)]">
                    {assetTypeLabel(listing.assetType)}
                </span>
                <TransferableBadge
                    transferable={listing.transferable}
                    transferableFrom={listing.transferableFrom}
                />
            </div>

            <div className="text-[16px] font-medium">{title?.[1]}</div>

            <div className="flex flex-col gap-1.5">
                {rows.map(([key, value]) => (
                    <div key={key} className="flex justify-between text-[13px]">
                        <span className="text-[var(--color-apagado)]">{key}</span>
                        <span className="font-mono">{value}</span>
                    </div>
                ))}
            </div>

            {/* Decir cuántos campos faltan es más honesto que ocultar el hueco:
                el comprador sabe qué está mirando a medias antes de entrar. */}
            {listing.hiddenFields.length > 0 && (
                <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-apagado)]">
                    <LockIcon />
                    {listing.hiddenFields.length}{' '}
                    {listing.hiddenFields.length === 1 ? 'dato reservado' : 'datos reservados'}
                </span>
            )}

            <div className="mt-auto flex items-baseline justify-between border-t border-[var(--color-borde)] pt-3.5">
                <span className="font-mono text-[21px] font-bold text-[var(--color-acento)]">
                    {money(listing.askingPrice)}
                </span>
                {offers ? (
                    <span className="font-mono text-[11px] text-[var(--color-apagado)]">
                        {offers} {offers === 1 ? 'oferta' : 'ofertas'}
                    </span>
                ) : null}
            </div>
        </Link>
    );
}
