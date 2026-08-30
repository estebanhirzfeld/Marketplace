import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { MyListingDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { actorActual } from '@/lib/sesion';
import { Revelar } from '@/components/Revelar';
import { FormularioPublicar } from '@/components/FormularioPublicar';
import { EstadoListing } from '@/components/EstadoListing';
import { Boton, Panel, Titulo, Vacio } from '@/components/ui';
import { monto, etiquetaTipo } from '@/lib/formato';
import { publicar, enviarARevision } from './acciones';

export const metadata = { title: 'Vender · Traspaso' };

export default async function Vender() {
    if (!(await actorActual())) redirect('/ingresar');

    let listings: MyListingDto[] = [];
    try {
        listings = await api().misListings();
    } catch {
        listings = [];
    }

    return (
        <div className="mx-auto max-w-[1400px] px-6 py-16 sm:px-12">
            <Revelar>
                <Titulo sub="Publicá un activo y recibí ofertas. Cobrás cuando el traspaso está hecho, no antes.">
                    Vender
                </Titulo>
            </Revelar>

            <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
                <Revelar>
                    <Panel titulo="NUEVO ACTIVO">
                        <FormularioPublicar accion={publicar} />
                    </Panel>
                </Revelar>

                <Revelar retraso={100}>
                    <Panel titulo="MIS ACTIVOS">
                        {listings.length === 0 ? (
                            <Vacio
                                titulo="Todavía no publicaste nada"
                                texto="Cargá tu primer activo con el formulario de la izquierda. Nace como borrador: nadie lo ve hasta que lo envíes a revisión."
                            />
                        ) : (
                            <div className="flex flex-col divide-y divide-[var(--color-borde-sutil)]">
                                {listings.map((l) => (
                                    <div key={l.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-apagado)]">
                                                {etiquetaTipo(l.assetType)}
                                            </span>
                                            <EstadoListing estado={l.status} />
                                        </div>

                                        <div className="flex flex-wrap items-baseline justify-between gap-3">
                                            <span className="font-mono text-[19px] font-bold text-[var(--color-acento)]">
                                                {monto(l.askingPrice)}
                                            </span>
                                            <span className="text-[12px] text-[var(--color-apagado)]">
                                                Estimado: <span className="font-mono">{monto(l.estimatedPrice)}</span>
                                            </span>
                                        </div>

                                        {l.rejectionReason && (
                                            <p className="text-[13px] leading-relaxed text-[var(--color-error)]">
                                                Motivo del rechazo: {l.rejectionReason}
                                            </p>
                                        )}

                                        <div className="flex flex-wrap gap-2.5">
                                            {(l.status === 'draft' || l.status === 'rejected') && (
                                                <form action={enviarARevision.bind(null, l.id)}>
                                                    <Boton type="submit" variante="secundario" className="px-4 py-2 text-[13px]">
                                                        Enviar a revisión
                                                    </Boton>
                                                </form>
                                            )}
                                            {(l.status === 'published' || l.status === 'in_operation') && (
                                                <Link
                                                    href={`/vender/${l.id}/ofertas`}
                                                    className="rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] px-4 py-2 text-[13px] font-medium transition-colors hover:border-[var(--color-tenue)]"
                                                >
                                                    Ver ofertas
                                                </Link>
                                            )}
                                            <Link
                                                href={`/listings/${l.id}`}
                                                className="rounded-[var(--radius-chico)] px-4 py-2 text-[13px] text-[var(--color-tenue)] transition-colors hover:text-[var(--color-tinta)]"
                                            >
                                                Ver publicación
                                            </Link>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Panel>
                </Revelar>
            </div>
        </div>
    );
}
