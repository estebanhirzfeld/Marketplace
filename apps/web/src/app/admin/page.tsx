import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ApiError } from '@marketplace/api-client';
import type { MyListingDto } from '@marketplace/api-contract';
import { UserRole } from '@marketplace/shared-types';
import { api } from '@/lib/api';
import { currentActor } from '@/lib/session';
import { Reveal } from '@/components/Reveal';
import { ListingReview } from '@/components/ListingReview';
import { Panel, Heading, EmptyState } from '@/components/ui';
import { money, assetTypeLabel } from '@/lib/format';
import { approveListing, rejectListing } from './actions';

export const metadata = { title: 'Revisión · Traspaso' };

/**
 * Panel de la plataforma.
 *
 * El gate real está en el dominio (`assertIsAdmin`), pero redirigimos igual
 * para no mostrarle a un usuario común una pantalla que solo le va a devolver
 * errores.
 */
export default async function Admin() {
    const actor = await currentActor();
    if (!actor) redirect('/ingresar');
    if (actor.role !== UserRole.ADMIN) redirect('/');

    let queue: MyListingDto[] = [];
    let error: string | undefined;

    try {
        queue = await api().listingsParaRevisar();
    } catch (e) {
        error = e instanceof ApiError ? e.message : 'No pudimos cargar la cola de revisión.';
    }

    return (
        <div className="mx-auto max-w-[1100px] px-6 py-16 sm:px-12">
            <Reveal>
                <Heading sub="Los activos esperando aprobación para salir al mercado. Aprobar los publica; rechazar exige un motivo que el vendedor va a leer.">
                    Cola de revisión
                </Heading>
            </Reveal>

            <div className="mt-10 flex flex-col gap-6">
                {error ? (
                    <EmptyState title="No pudimos cargar la cola" text={error} />
                ) : queue.length === 0 ? (
                    <EmptyState
                        title="No hay nada para revisar"
                        text="Cuando un vendedor envíe un activo a revisión va a aparecer acá."
                    />
                ) : (
                    queue.map((l, i) => (
                        <Reveal key={l.id} delay={Math.min(i, 6) * 80}>
                            <Panel title={assetTypeLabel(l.assetType)}>
                                <div className="flex flex-col gap-5">
                                    <div className="flex flex-wrap items-baseline justify-between gap-4">
                                        <div className="flex flex-col gap-1.5">
                                            <span className="font-mono text-[24px] font-bold text-[var(--color-acento)]">
                                                {money(l.askingPrice)}
                                            </span>
                                            <span className="text-[13px] text-[var(--color-tenue)]">
                                                Nuestra valuación estimada:{' '}
                                                <span className="font-mono">{money(l.estimatedPrice)}</span>
                                            </span>
                                        </div>

                                        <div className="flex flex-col items-end gap-1.5">
                                            <Link
                                                href={`/listings/${l.id}`}
                                                className="text-[13px] text-[var(--color-tenue)] transition-colors hover:text-[var(--color-tinta)]"
                                            >
                                                Ver la publicación →
                                            </Link>
                                        </div>
                                    </div>

                                    <div className="border-t border-[var(--color-borde)] pt-5">
                                        <ListingReview
                                            approveListing={approveListing.bind(null, l.id)}
                                            rejectListing={rejectListing.bind(null, l.id)}
                                        />
                                    </div>
                                </div>
                            </Panel>
                        </Reveal>
                    ))
                )}
            </div>
        </div>
    );
}
