import Link from 'next/link';
import { ApiError } from '@marketplace/api-client';
import type { MyListingDto, OperationStatusDto, PlatformDashboardDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { requireAdmin } from '@/lib/guards';
import { Reveal } from '@/components/Reveal';
import { ListingReview } from '@/components/ListingReview';
import { Panel, Heading, EmptyState, OperationStatusBadge } from '@/components/ui';
import { money } from '@/lib/format';
import { assetTypeLabeller } from '@/lib/assetTypes';
import { approveListing, rejectListing } from './actions';

export const metadata = { title: 'Panel · Traspaso' };

/**
 * Qué le toca hacer a la plataforma en cada etapa. El estado dice dónde está
 * parada la operación; esto dice qué hacer con ella, que es lo que un panel
 * tiene que responder.
 */
const PROXIMO_PASO: Partial<Record<OperationStatusDto, string>> = {
    // Las partes no pueden firmar hasta que dejemos constancia del acceso: el
    // dominio rechaza la firma sin ella, así que acá la operación está parada
    // esperándonos a nosotros.
    contract_pending: 'Registrar nuestro acceso al activo para habilitar la firma',
    transfer_in_progress: 'Verificar el activo y declarar la custodia',
    asset_in_custody: 'Esperando el pago del comprador',
    payment_received: 'Liquidar al vendedor y cerrar la operación',
};

function Metrica({
    valor,
    etiqueta,
    alerta = false,
}: {
    valor: number;
    etiqueta: string;
    alerta?: boolean;
}) {
    return (
        <div className="flex flex-col gap-1.5 rounded-[var(--radius-medio)] border border-[var(--color-borde)] bg-[var(--color-superficie)] p-5">
            <span
                className={`font-mono text-[28px] font-bold ${
                    alerta && valor > 0 ? 'text-[var(--color-alerta)]' : 'text-[var(--color-tinta)]'
                }`}
            >
                {valor}
            </span>
            <span className="text-[12px] leading-relaxed text-[var(--color-tenue)]">{etiqueta}</span>
        </div>
    );
}

/**
 * Panel de la plataforma.
 *
 * El gate real está en el dominio (`assertIsAdmin`), pero redirigimos igual
 * para no mostrarle a un usuario común una pantalla que solo le va a devolver
 * errores.
 */
export default async function Admin() {
    await requireAdmin();
    const nombreDeTipo = await assetTypeLabeller();

    let queue: MyListingDto[] = [];
    let tablero: PlatformDashboardDto | undefined;
    let error: string | undefined;

    // Las dos lecturas son independientes: si una falla, la otra se muestra
    // igual. Un tablero caído no debería dejar sin revisar la cola.
    const [colaResult, tableroResult] = await Promise.allSettled([
        api().listingsParaRevisar(),
        api().platformDashboard(),
    ]);

    if (colaResult.status === 'fulfilled') {
        queue = colaResult.value;
    } else {
        const e = colaResult.reason;
        error = e instanceof ApiError ? e.message : 'No pudimos cargar la cola de revisión.';
    }
    if (tableroResult.status === 'fulfilled') tablero = tableroResult.value;

    return (
        <div className="mx-auto max-w-[1100px] px-6 py-16 sm:px-12">
            <Reveal>
                <Heading sub="El estado del mercado y lo que está esperando un movimiento nuestro.">
                    Panel de la plataforma
                </Heading>
            </Reveal>

            {tablero && (
                <>
                    <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Metrica
                            valor={tablero.listingsToReview}
                            etiqueta="Activos esperando revisión"
                            alerta={tablero.listingsToReview > 0}
                        />
                        <Metrica valor={tablero.publishedListings} etiqueta="Publicados en el mercado" />
                        <Metrica valor={tablero.operationsInProgress} etiqueta="Con contrato en marcha" />
                        <Metrica
                            valor={tablero.openReports}
                            etiqueta="Reclamos abiertos"
                            alerta={tablero.openReports > 0}
                        />
                    </div>

                    <div className="mt-4">
                        <Panel title="COMISIONES COBRADAS">
                            <div className="flex items-baseline justify-between gap-4">
                                <span className="font-mono text-[28px] font-bold text-[var(--color-acento)]">
                                    {money(tablero.earned)}
                                </span>
                                <span className="max-w-[420px] text-right text-[12px] leading-relaxed text-[var(--color-apagado)]">
                                    El 5 % de cada parte, solo de las operaciones ya completadas.
                                    Lo comprometido en operaciones abiertas no se cuenta.
                                </span>
                            </div>
                        </Panel>
                    </div>

                    {/* Lo que efectivamente hay que hacer. Antes había que
                        entrar operación por operación para descubrir cuál
                        estaba esperando un paso nuestro. */}
                    {tablero.pending.length > 0 && (
                        <div className="mt-4">
                            <Panel title="ESPERANDO A LA PLATAFORMA">
                                <div className="flex flex-col">
                                    {tablero.pending.map((p) => (
                                        <Link
                                            key={p.id}
                                            href={`/operaciones/${p.id}`}
                                            className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-borde)] py-3 last:border-0 transition-colors hover:text-[var(--color-acento)]"
                                        >
                                            <div className="flex items-center gap-3">
                                                <OperationStatusBadge state={p.status} />
                                                <span className="text-[13px] text-[var(--color-tenue)]">
                                                    {PROXIMO_PASO[p.status] ?? 'Revisar la operación'}
                                                </span>
                                            </div>
                                            <span className="font-mono text-[13px]">
                                                {p.amount ? money(p.amount) : '—'}
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            </Panel>
                        </div>
                    )}
                </>
            )}

            <div className="mt-10 flex flex-col gap-3">
                <h2 className="font-mono text-[13px] font-medium tracking-[0.1em] text-[var(--color-tenue)]">
                    COLA DE REVISIÓN
                </h2>
                <p className="max-w-[600px] text-[13px] leading-relaxed text-[var(--color-tenue)]">
                    Aprobar publica el activo en el mercado; rechazar exige un motivo que el
                    vendedor va a leer.
                </p>
            </div>

            <div className="mt-6 flex flex-col gap-6">
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
                            <Panel title={nombreDeTipo(l.assetType)}>
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
