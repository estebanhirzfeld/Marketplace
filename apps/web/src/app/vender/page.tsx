import { redirect } from 'next/navigation';
import { SubmitButton } from '@/components/SubmitButton';
import Link from 'next/link';
import type { MyListingDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { requireCounterparty } from '@/lib/guards';
import { Reveal } from '@/components/Reveal';
import { PublishListingForm } from '@/components/PublishListingForm';
import { ListingStatusBadge } from '@/components/ListingStatusBadge';
import { Button, Panel, Heading, EmptyState } from '@/components/ui';
import { money, assetTypeLabel } from '@/lib/format';
import { estimateListingPrice, publishListing, startVerification, submitForReview } from './actions';

export const metadata = { title: 'Vender · Traspaso' };

/**
 * El resultado de la vuelta del consentimiento de Google. Llega por la
 * dirección porque la vuelta la maneja un route handler, que redirige acá.
 */
const RESULTADOS: Record<string, { text: string; ok: boolean }> = {
    ok: { text: 'Listo: quedó comprobado que controlás el activo.', ok: true },
    'sin-control': {
        text: 'Esa cuenta de Google no controla el activo que publicaste. Si es un canal con Cuenta de Marca, elegila al iniciar sesión.',
        ok: false,
    },
    cancelada: { text: 'Cancelaste la verificación. Podés volver a intentarla cuando quieras.', ok: false },
    'no-configurada': { text: 'La verificación con Google todavía no está configurada.', ok: false },
    invalida: { text: 'No pudimos identificar qué activo se estaba verificando.', ok: false },
    error: { text: 'No pudimos completar la verificación. Probá de nuevo.', ok: false },
};

export default async function Vender({
    searchParams,
}: {
    // En Next 16 `searchParams` es una promesa: el acceso sincrónico se eliminó.
    searchParams: Promise<{ verificacion?: string }>;
}) {
    await requireCounterparty();

    const resultado = RESULTADOS[(await searchParams).verificacion ?? ''];

    let listings: MyListingDto[] = [];
    try {
        listings = await api().misListings();
    } catch {
        listings = [];
    }

    return (
        <div className="mx-auto max-w-[1400px] px-6 py-16 sm:px-12">
            <Reveal>
                <Heading sub="Publicá un activo y recibí ofertas. Cobrás cuando el traspaso está hecho, no antes.">
                    Vender
                </Heading>
            </Reveal>

            {resultado && (
                <div
                    className={`mt-6 rounded-[var(--radius-chico)] border p-4 text-[13px] leading-relaxed ${
                        resultado.ok
                            ? 'border-[var(--color-acento)]/40 text-[var(--color-acento)]'
                            : 'border-[var(--color-alerta)]/40 text-[var(--color-alerta)]'
                    }`}
                >
                    {resultado.text}
                </div>
            )}

            <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
                <Reveal>
                    <Panel title="NUEVO ACTIVO">
                        <PublishListingForm action={publishListing} estimate={estimateListingPrice} />
                    </Panel>
                </Reveal>

                <Reveal delay={100}>
                    <Panel title="MIS ACTIVOS">
                        {listings.length === 0 ? (
                            <EmptyState
                                title="Todavía no publicaste nada"
                                text="Cargá tu primer activo con el formulario de la izquierda. Nace como borrador: nadie lo ve hasta que lo envíes a revisión."
                            />
                        ) : (
                            <div className="flex flex-col divide-y divide-[var(--color-borde-sutil)]">
                                {listings.map((l) => (
                                    <div key={l.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-apagado)]">
                                                {assetTypeLabel(l.assetType)}
                                            </span>
                                            <ListingStatusBadge state={l.status} />
                                        </div>

                                        <div className="flex flex-wrap items-baseline justify-between gap-3">
                                            <span className="font-mono text-[19px] font-bold text-[var(--color-acento)]">
                                                {money(l.askingPrice)}
                                            </span>
                                            <span className="text-[12px] text-[var(--color-apagado)]">
                                                Estimado: <span className="font-mono">{money(l.estimatedPrice)}</span>
                                            </span>
                                        </div>

                                        {l.rejectionReason && (
                                            <p className="text-[13px] leading-relaxed text-[var(--color-error)]">
                                                Motivo del rechazo: {l.rejectionReason}
                                            </p>
                                        )}

                                        {l.ownership ? (
                                            <p className="text-[12px] leading-relaxed text-[var(--color-acento)]">
                                                Titularidad comprobada con{' '}
                                                {l.ownership.source === 'adsense' ? 'AdSense' : 'YouTube'} el{' '}
                                                {new Date(l.ownership.verifiedAt).toLocaleDateString('es-AR')}
                                                {l.ownership.monthlyRevenueCents !== undefined && (
                                                    <>
                                                        {' '}· ingreso comprobado{' '}
                                                        <span className="font-mono">
                                                            {money({
                                                                cents: l.ownership.monthlyRevenueCents,
                                                                currency: 'USD',
                                                            })}
                                                        </span>
                                                    </>
                                                )}
                                            </p>
                                        ) : (
                                            <p className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                                                Verificá que controlás el activo: es lo que le prueba al
                                                comprador que sos quien puede venderlo.
                                            </p>
                                        )}

                                        <div className="flex flex-wrap gap-2.5">
                                            {!l.ownership && (
                                                <form
                                                    action={startVerification.bind(
                                                        null,
                                                        l.id,
                                                        l.assetType === 'web' ? 'adsense' : 'youtube',
                                                    )}
                                                >
                                                    <SubmitButton
                                                        variant="secundario"
                                                        className="px-4 py-2 text-[13px]"
                                                        pendingText="Redirigiendo a Google…"
                                                    >
                                                        {l.assetType === 'web'
                                                            ? 'Verificar con AdSense'
                                                            : 'Verificar con YouTube'}
                                                    </SubmitButton>
                                                </form>
                                            )}

                                            {(l.status === 'draft' || l.status === 'rejected') && (
                                                <form action={submitForReview.bind(null, l.id)}>
                                                    <SubmitButton
                                                        variant="secundario"
                                                        className="px-4 py-2 text-[13px]"
                                                        pendingText="Enviando…"
                                                    >
                                                        Enviar a revisión
                                                    </SubmitButton>
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
                </Reveal>
            </div>
        </div>
    );
}
