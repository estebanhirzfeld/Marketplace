import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ApiError } from '@marketplace/api-client';
import type { OfferSummaryDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { currentActor } from '@/lib/session';
import { Reveal } from '@/components/Reveal';
import { OperationStatusBadge, Panel, Heading, EmptyState } from '@/components/ui';
import { money } from '@/lib/format';

/**
 * Las ofertas recibidas por un listing. La API lo autoriza solo al dueño:
 * es lo que preserva la licitación a sobre cerrado, porque un comprador no
 * puede ver las ofertas rivales.
 */
export default async function OfertasDelListing(props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;

    if (!(await currentActor())) redirect('/ingresar');

    let offers: OfferSummaryDto[];
    try {
        offers = await api().offersOf(id);
    } catch (e) {
        if (e instanceof ApiError && (e.code === 'FORBIDDEN' || e.code === 'NOT_FOUND')) notFound();
        throw e;
    }

    return (
        <div className="mx-auto max-w-[1000px] px-6 py-16 sm:px-12">
            <Reveal>
                <Heading sub="Cada comprador ve solo su propia oferta. Aceptar una cancela automáticamente las demás.">
                    Ofertas recibidas
                </Heading>
            </Reveal>

            <div className="mt-8">
                <Link href="/vender" className="text-[14px] text-[var(--color-tenue)]">
                    ← Volver a mis activos
                </Link>
            </div>

            <div className="mt-6">
                {offers.length === 0 ? (
                    <EmptyState
                        title="Todavía no hay ofertas"
                        text="Cuando alguien oferte por este activo vas a verlo acá, con el monto y a quién le toca responder."
                    />
                ) : (
                    <Panel title={`${offers.length} ${offers.length === 1 ? 'OFERTA ACTIVA' : 'OFERTAS ACTIVAS'}`}>
                        <div className="flex flex-col divide-y divide-[var(--color-borde-sutil)]">
                            {offers.map((o) => (
                                <Link
                                    key={o.id}
                                    href={`/operaciones/${o.id}`}
                                    className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                                >
                                    <div className="flex flex-col gap-2">
                                        <OperationStatusBadge state={o.status} />
                                        <span className="text-[13px] text-[var(--color-apagado)]">
                                            {o.pendingResponseFrom === 'seller'
                                                ? 'Te toca responder'
                                                : 'Esperando al comprador'}
                                        </span>
                                    </div>
                                    <span className="font-mono text-[21px] font-bold text-[var(--color-acento)]">
                                        {money(o.currentOfferPrice)}
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
