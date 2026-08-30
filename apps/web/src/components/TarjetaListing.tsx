import Link from 'next/link';
import type { ListingSummaryDto } from '@marketplace/api-contract';
import { Candado } from './Candado';
import { monto, etiquetaTipo, metricasDeTarjeta } from '@/lib/formato';

export function TarjetaListing({
    listing,
    ofertas,
}: {
    listing: ListingSummaryDto;
    ofertas?: number;
}) {
    const metricas = metricasDeTarjeta(listing.assetType, listing.assetData);
    const [titulo, ...filas] = metricas;

    return (
        <Link
            href={`/listings/${listing.id}`}
            className="flex h-full flex-col gap-4 rounded-[var(--radius-medio)] border border-[var(--color-borde)] bg-[var(--color-superficie)] p-5 transition-[transform,border-color] duration-500 [transition-timing-function:var(--ease-rebote)] hover:-translate-y-1 hover:border-[var(--color-borde-fuerte)]"
        >
            <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-apagado)]">
                    {etiquetaTipo(listing.assetType)}
                </span>
                {listing.hiddenFields.length > 0 && (
                    <span className="flex items-center gap-1.5">
                        <Candado />
                        <span className="font-mono text-[10px] text-[var(--color-alerta)]">NDA</span>
                    </span>
                )}
            </div>

            <div className="text-[16px] font-medium">{titulo?.[1]}</div>

            <div className="flex flex-col gap-1.5">
                {filas.map(([clave, valor]) => (
                    <div key={clave} className="flex justify-between text-[12px]">
                        <span className="text-[var(--color-apagado)]">{clave}</span>
                        <span className="font-mono">{valor}</span>
                    </div>
                ))}
            </div>

            {/* Decir cuántos campos faltan es más honesto que ocultar el hueco:
                el comprador sabe qué está mirando a medias antes de entrar. */}
            {listing.hiddenFields.length > 0 && (
                <span className="text-[11px] text-[var(--color-apagado)]">
                    {listing.hiddenFields.length}{' '}
                    {listing.hiddenFields.length === 1 ? 'dato reservado' : 'datos reservados'} bajo NDA
                </span>
            )}

            <div className="mt-auto flex items-baseline justify-between border-t border-[var(--color-borde)] pt-3.5">
                <span className="font-mono text-[21px] font-bold text-[var(--color-acento)]">
                    {monto(listing.askingPrice)}
                </span>
                {ofertas ? (
                    <span className="font-mono text-[11px] text-[var(--color-apagado)]">
                        {ofertas} {ofertas === 1 ? 'oferta' : 'ofertas'}
                    </span>
                ) : null}
            </div>
        </Link>
    );
}
