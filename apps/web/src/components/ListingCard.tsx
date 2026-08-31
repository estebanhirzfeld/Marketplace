import Link from 'next/link';
import type { AssetTypeDescriptorDto, ListingSummaryDto } from '@marketplace/api-contract';
import { LockIcon } from './LockIcon';
import { TransferableBadge } from './Transferability';
import { money, fieldValue, nicheLabel } from '@/lib/format';

/**
 * Una tarjeta del mercado.
 *
 * Qué métricas resumen el activo lo decide su tipo, no la tarjeta: acá había
 * un `switch` que sabía que un canal se resume con suscriptores y un sitio con
 * autoridad de dominio, duplicando lo que la estrategia ya declara. El
 * descriptor llega desde la página, que lo pide una vez para toda la grilla.
 */
export function ListingCard({
    listing,
    descriptor,
    offers,
}: {
    listing: ListingSummaryDto;
    /** Ausente si la metadata del catálogo no llegó; la tarjeta se dibuja igual. */
    descriptor?: AssetTypeDescriptorDto;
    offers?: number;
}) {
    const filas = (descriptor?.summaryMetricKeys ?? [])
        .map((clave) => descriptor!.fields.find((f) => f.key === clave))
        .filter((f): f is NonNullable<typeof f> => f !== undefined)
        .map((f) => [f.label, fieldValue(f.kind, listing.assetData[f.key])] as const);

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
                    {(descriptor?.label ?? listing.assetType).toUpperCase()}
                </span>
                <TransferableBadge
                    transferable={listing.transferable}
                    transferableFrom={listing.transferableFrom}
                />
            </div>

            <div className="text-[16px] font-medium">{nicheLabel(listing.assetData.niche)}</div>

            <div className="flex flex-col gap-1.5">
                {filas.map(([etiqueta, valor]) => (
                    <div key={etiqueta} className="flex justify-between text-[13px]">
                        <span className="text-[var(--color-apagado)]">{etiqueta}</span>
                        <span className="font-mono">{valor}</span>
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
