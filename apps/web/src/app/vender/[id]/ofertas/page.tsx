import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ApiError } from '@marketplace/api-client';
import type { OfferSummaryDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { actorActual } from '@/lib/sesion';
import { Revelar } from '@/components/Revelar';
import { EstadoOperacion, Panel, Titulo, Vacio } from '@/components/ui';
import { monto } from '@/lib/formato';

/**
 * Las ofertas recibidas por un listing. La API lo autoriza solo al dueño:
 * es lo que preserva la licitación a sobre cerrado, porque un comprador no
 * puede ver las ofertas rivales.
 */
export default async function OfertasDelListing(props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;

    if (!(await actorActual())) redirect('/ingresar');

    let ofertas: OfferSummaryDto[];
    try {
        ofertas = await api().offersOf(id);
    } catch (e) {
        if (e instanceof ApiError && (e.code === 'FORBIDDEN' || e.code === 'NOT_FOUND')) notFound();
        throw e;
    }

    return (
        <div className="mx-auto max-w-[1000px] px-6 py-16 sm:px-12">
            <Revelar>
                <Titulo sub="Cada comprador ve solo su propia oferta. Aceptar una cancela automáticamente las demás.">
                    Ofertas recibidas
                </Titulo>
            </Revelar>

            <div className="mt-8">
                <Link href="/vender" className="text-[14px] text-[var(--color-tenue)]">
                    ← Volver a mis activos
                </Link>
            </div>

            <div className="mt-6">
                {ofertas.length === 0 ? (
                    <Vacio
                        titulo="Todavía no hay ofertas"
                        texto="Cuando alguien oferte por este activo vas a verlo acá, con el monto y a quién le toca responder."
                    />
                ) : (
                    <Panel titulo={`${ofertas.length} ${ofertas.length === 1 ? 'OFERTA ACTIVA' : 'OFERTAS ACTIVAS'}`}>
                        <div className="flex flex-col divide-y divide-[var(--color-borde-sutil)]">
                            {ofertas.map((o) => (
                                <Link
                                    key={o.id}
                                    href={`/operaciones/${o.id}`}
                                    className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                                >
                                    <div className="flex flex-col gap-2">
                                        <EstadoOperacion estado={o.status} />
                                        <span className="text-[13px] text-[var(--color-apagado)]">
                                            {o.pendingResponseFrom === 'seller'
                                                ? 'Te toca responder'
                                                : 'Esperando al comprador'}
                                        </span>
                                    </div>
                                    <span className="font-mono text-[21px] font-bold text-[var(--color-acento)]">
                                        {monto(o.currentOfferPrice)}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </Panel>
                )}
            </div>
        </div>
    );
}
