import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ApiError } from '@marketplace/api-client';
import type { MyListingDto } from '@marketplace/api-contract';
import { UserRole } from '@marketplace/shared-types';
import { api } from '@/lib/api';
import { actorActual } from '@/lib/sesion';
import { Revelar } from '@/components/Revelar';
import { RevisionListing } from '@/components/RevisionListing';
import { Panel, Titulo, Vacio } from '@/components/ui';
import { monto, etiquetaTipo } from '@/lib/formato';
import { aprobar, rechazar } from './acciones';

export const metadata = { title: 'Revisión · Traspaso' };

/**
 * Panel de la plataforma.
 *
 * El gate real está en el dominio (`assertIsAdmin`), pero redirigimos igual
 * para no mostrarle a un usuario común una pantalla que solo le va a devolver
 * errores.
 */
export default async function Admin() {
    const actor = await actorActual();
    if (!actor) redirect('/ingresar');
    if (actor.role !== UserRole.ADMIN) redirect('/');

    let cola: MyListingDto[] = [];
    let error: string | undefined;

    try {
        cola = await api().listingsParaRevisar();
    } catch (e) {
        error = e instanceof ApiError ? e.message : 'No pudimos cargar la cola de revisión.';
    }

    return (
        <div className="mx-auto max-w-[1100px] px-6 py-16 sm:px-12">
            <Revelar>
                <Titulo sub="Los activos esperando aprobación para salir al mercado. Aprobar los publica; rechazar exige un motivo que el vendedor va a leer.">
                    Cola de revisión
                </Titulo>
            </Revelar>

            <div className="mt-10 flex flex-col gap-6">
                {error ? (
                    <Vacio titulo="No pudimos cargar la cola" texto={error} />
                ) : cola.length === 0 ? (
                    <Vacio
                        titulo="No hay nada para revisar"
                        texto="Cuando un vendedor envíe un activo a revisión va a aparecer acá."
                    />
                ) : (
                    cola.map((l, i) => (
                        <Revelar key={l.id} retraso={Math.min(i, 6) * 80}>
                            <Panel titulo={etiquetaTipo(l.assetType)}>
                                <div className="flex flex-col gap-5">
                                    <div className="flex flex-wrap items-baseline justify-between gap-4">
                                        <div className="flex flex-col gap-1.5">
                                            <span className="font-mono text-[24px] font-bold text-[var(--color-acento)]">
                                                {monto(l.askingPrice)}
                                            </span>
                                            <span className="text-[13px] text-[var(--color-tenue)]">
                                                Nuestra valuación estimada:{' '}
                                                <span className="font-mono">{monto(l.estimatedPrice)}</span>
                                            </span>
                                        </div>

                                        <div className="flex flex-col items-end gap-1.5">
                                            {l.isBlind && (
                                                <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-alerta)]">
                                                    CONFIDENCIAL
                                                </span>
                                            )}
                                            <Link
                                                href={`/listings/${l.id}`}
                                                className="text-[13px] text-[var(--color-tenue)] transition-colors hover:text-[var(--color-tinta)]"
                                            >
                                                Ver la publicación →
                                            </Link>
                                        </div>
                                    </div>

                                    <div className="border-t border-[var(--color-borde)] pt-5">
                                        <RevisionListing
                                            aprobar={aprobar.bind(null, l.id)}
                                            rechazar={rechazar.bind(null, l.id)}
                                        />
                                    </div>
                                </div>
                            </Panel>
                        </Revelar>
                    ))
                )}
            </div>
        </div>
    );
}
