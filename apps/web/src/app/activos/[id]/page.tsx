import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError } from '@marketplace/api-client';
import type { ListingDetailDto, MyListingDto, OfferSummaryDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { requireCounterparty } from '@/lib/guards';
import { Reveal } from '@/components/Reveal';
import { ListingStatusBadge } from '@/components/ListingStatusBadge';
import { OperationStatusBadge, Panel, EmptyState, ButtonLink } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { OperationAction } from '@/components/OperationAction';
import {
    fechaLarga,
    money,
    nicheLabel,
    fieldValue,
} from '@/lib/format';
import { startVerification, submitForReview } from '../../vender/actions';

/**
 * La vista de control de un activo.
 *
 * Antes su estado, sus ofertas y sus verificaciones vivían en tres lugares
 * distintos —el listado de "Vender", una pantalla aparte de ofertas y el
 * detalle público—, así que el vendedor tenía que ir y volver para entender
 * qué pasaba con una sola cosa suya.
 */
const PESTANAS = {
    estado: 'Estado',
    ofertas: 'Ofertas',
    verificaciones: 'Verificaciones',
} as const;

type ClaveDePestana = keyof typeof PESTANAS;

function esPestana(v: unknown): v is ClaveDePestana {
    return typeof v === 'string' && v in PESTANAS;
}

const COMISION = 0.05;

export default async function DetalleDeActivo(props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ ver?: string; verificacion?: string }>;
}) {
    await requireCounterparty();
    const { id } = await props.params;
    const query = await props.searchParams;
    const pestana = esPestana(query.ver) ? query.ver : 'estado';

    // El catálogo propio dice el estado real y el motivo de rechazo; el detalle
    // dice el resto. Son dos lecturas porque son dos permisos distintos.
    let mio: MyListingDto | undefined;
    let listing: ListingDetailDto;
    try {
        const [mios, detalle] = await Promise.all([api().misListings(), api().listing(id)]);
        mio = mios.find((l) => l.id === id);
        listing = detalle;
    } catch (e) {
        if (e instanceof ApiError && e.code === 'NOT_FOUND') notFound();
        throw e;
    }

    // Si no está entre los propios, no es tuyo: no existe para esta pantalla.
    if (!mio) notFound();

    let offers: OfferSummaryDto[] = [];
    try {
        offers = await api().offersOf(id);
    } catch {
        offers = [];
    }

    const sinResponder = offers.filter((o) => o.pendingResponseFrom === 'seller').length;
    const rubro = mio.niche ? nicheLabel(mio.niche) : 'Activo';
    // El activo es suyo, así que el nombre le llega siempre. El rubro y el
    // tipo quedan como subtítulo: dicen de qué se trata sin repetir el nombre.
    const nombre = typeof listing.assetData.name === 'string' && listing.assetData.name
        ? listing.assetData.name
        : `${rubro} · ${listing.descriptor.label}`;

    const tab = (clave: ClaveDePestana) =>
        `-mb-px border-b-2 px-4 py-3 text-[14px] transition-colors ${
            pestana === clave
                ? 'border-[var(--color-acento)] text-[var(--color-tinta)]'
                : 'border-transparent text-[var(--color-tenue)] hover:text-[var(--color-tinta)]'
        }`;

    const cuenta: Record<ClaveDePestana, string> = {
        estado: '',
        ofertas: offers.length > 0 ? String(offers.length) : '',
        verificaciones: mio.ownership ? '' : '1 pendiente',
    };

    return (
        <div className="mx-auto max-w-[1100px] px-6 py-14 sm:px-12">
            <Reveal>
                <div className="flex items-center gap-2 text-[13px] text-[var(--color-apagado)]">
                    <Link href="/activos" className="hover:text-[var(--color-tinta)]">
                        Mis activos
                    </Link>
                    <span>/</span>
                    <span className="text-[var(--color-tenue)]">{nombre}</span>
                </div>

                <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
                    <div className="flex flex-col gap-2.5">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <ListingStatusBadge state={mio.status} />
                            {mio.transferable && (
                                <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-listo)]">
                                    TRANSFERENCIA INMEDIATA
                                </span>
                            )}
                        </div>
                        <h1 className="text-[30px] font-bold tracking-[-0.03em]">{nombre}</h1>
                        <span className="text-[13px] text-[var(--color-apagado)]">
                            {rubro} · {listing.descriptor.label}
                        </span>
                    </div>

                    <div className="text-right">
                        <div className="font-mono text-[28px] font-bold text-[var(--color-acento)]">
                            {money(mio.askingPrice)}
                        </div>
                        <div className="mt-1.5 font-mono text-[13px] text-[var(--color-apagado)]">
                            valuación {money(mio.estimatedPrice)}
                        </div>
                    </div>
                </div>
            </Reveal>

            <div className="mt-7 flex gap-1 border-b border-[var(--color-borde)]">
                {(Object.keys(PESTANAS) as ClaveDePestana[]).map((k) => (
                    <Link
                        key={k}
                        href={`/activos/${id}?ver=${k}`}
                        aria-current={pestana === k ? 'page' : undefined}
                        className={tab(k)}
                    >
                        {PESTANAS[k]}
                        {cuenta[k] && (
                            <span className="ml-2 font-mono text-[12px] text-[var(--color-apagado)]">
                                {cuenta[k]}
                            </span>
                        )}
                    </Link>
                ))}
            </div>

            {/* ── OFERTAS: tabla, no tarjetas ───────────────────── */}
            {pestana === 'ofertas' && (
                <Reveal>
                    <div className="mt-6">
                        {offers.length === 0 ? (
                            <EmptyState
                                title="Todavía no recibiste ofertas"
                                text="Cuando alguien oferte por este activo lo vas a ver acá, con el monto y a quién le toca responder."
                            />
                        ) : (
                            <Panel
                                title="OFERTAS RECIBIDAS"
                                action={
                                    <span className="text-[13px] text-[var(--color-apagado)]">
                                        Aceptar una cancela las demás
                                    </span>
                                }
                            >
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="border-b border-[var(--color-borde)]">
                                                {['Comprador', 'Ofrece', 'Recibís', 'Situación', ''].map((c, i) => (
                                                    <th
                                                        key={c || i}
                                                        className={`px-3 py-2.5 font-mono text-[12px] font-normal tracking-[0.06em] text-[var(--color-apagado)] ${
                                                            i === 1 || i === 2 || i === 4 ? 'text-right' : 'text-left'
                                                        }`}
                                                    >
                                                        {c}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {offers.map((o) => {
                                                const neto = {
                                                    cents: Math.round(o.currentOfferPrice.cents * (1 - COMISION)),
                                                    currency: o.currentOfferPrice.currency,
                                                };
                                                const teToca = o.pendingResponseFrom === 'seller';
                                                return (
                                                    <tr
                                                        key={o.id}
                                                        className="border-b border-[var(--color-borde-sutil)] last:border-0"
                                                    >
                                                        <td className="px-3 py-3.5 text-[14px]">
                                                            <span className="flex items-center gap-2.5">
                                                                {o.buyerName}
                                                                {teToca && (
                                                                    <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-acento)]">
                                                                        TE TOCA
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-3.5 text-right font-mono text-[15px] font-medium">
                                                            {money(o.currentOfferPrice)}
                                                        </td>
                                                        {/*
                                                            El neto va al lado del bruto porque con
                                                            el 5 % de comisión el orden de
                                                            conveniencia puede no ser el del monto.
                                                        */}
                                                        <td className="px-3 py-3.5 text-right font-mono text-[13px] text-[var(--color-apagado)]">
                                                            {money(neto)}
                                                        </td>
                                                        <td className="px-3 py-3.5">
                                                            <OperationStatusBadge state={o.status} />
                                                        </td>
                                                        <td className="px-3 py-3.5 text-right">
                                                            <ButtonLink
                                                                href={`/operaciones/${o.id}`}
                                                                variant="secundario"
                                                            >
                                                                Abrir
                                                            </ButtonLink>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </Panel>
                        )}

                        {offers.length > 0 && (
                            <p className="mt-4 max-w-[640px] text-[13px] leading-relaxed text-[var(--color-apagado)]">
                                Los compradores no se ven entre sí: cada uno conoce solo su propia oferta.
                            </p>
                        )}
                    </div>
                </Reveal>
            )}

            {/* ── VERIFICACIONES ────────────────────────────────── */}
            {pestana === 'verificaciones' && (
                <Reveal>
                    {/*
                        Cuando la verificación no se puede ni empezar —la API
                        responde 503 sin credenciales de Google— el vendedor
                        vuelve acá con el motivo. Antes volvía a la pantalla de
                        publicar, que ya no muestra este aviso, así que el clic
                        parecía no hacer nada.
                    */}
                    {query.verificacion === 'no-configurada' && (
                        <div className="mt-6 rounded-[var(--radius-chico)] border border-[var(--color-alerta)]/40 p-4 text-[14px] leading-relaxed text-[var(--color-alerta)]">
                            La verificación con Google todavía no está configurada en este entorno,
                            así que no pudimos empezarla.
                        </div>
                    )}
                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                        <Panel title="TITULARIDAD">
                            {mio.ownership ? (
                                <div className="flex flex-col gap-2">
                                    <span className="text-[15px] text-[var(--color-listo)]">
                                        Comprobada contra {mio.ownership.source === 'adsense' ? 'AdSense' : 'YouTube'}
                                    </span>
                                    <span className="text-[13px] leading-relaxed text-[var(--color-apagado)]">
                                        Lo confirmamos el{' '}
                                        {new Date(mio.ownership.verifiedAt).toLocaleDateString('es-AR')}.
                                    </span>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    <span className="text-[15px] text-[var(--color-alerta)]">
                                        Falta comprobar que controlás el activo
                                    </span>
                                    <p className="text-[13px] leading-relaxed text-[var(--color-apagado)]">
                                        Te vamos a llevar a Google para que autorices la consulta. Es
                                        la verificación que impide que alguien publique un activo
                                        ajeno.
                                    </p>
                                    <form
                                        action={startVerification.bind(
                                            null,
                                            id,
                                            listing.descriptor.ownershipSource,
                                        )}
                                    >
                                        <SubmitButton
                                            variant="secundario"
                                            pendingText="Redirigiendo a Google…"
                                        >
                                            Verificar con{' '}
                                            {listing.descriptor.ownershipSource === 'adsense'
                                                ? 'AdSense'
                                                : 'YouTube'}
                                        </SubmitButton>
                                    </form>
                                </div>
                            )}
                        </Panel>

                        <Panel title="INGRESO MENSUAL">
                            {mio.ownership?.monthlyRevenueCents !== undefined ? (
                                <div className="flex flex-col gap-2">
                                    <span className="font-mono text-[15px] text-[var(--color-listo)]">
                                        {money({
                                            cents: mio.ownership.monthlyRevenueCents,
                                            currency: 'USD',
                                        })}{' '}
                                        comprobados
                                    </span>
                                    <span className="text-[13px] leading-relaxed text-[var(--color-apagado)]">
                                        Lo informa Google, no vos. Es el dato que sostiene la valuación.
                                    </span>
                                </div>
                            ) : (
                                <p className="text-[13px] leading-relaxed text-[var(--color-apagado)]">
                                    {listing.descriptor.revenueNotice}
                                </p>
                            )}
                        </Panel>

                        {/*
                            Acá vive el trabajo real del vendedor. Los pasos estaban
                            escritos en cada estrategia desde el principio y no se
                            mostraban en ninguna pantalla, así que el vendedor no
                            tenía cómo saber qué hacer y se enteraba recién cuando
                            una operación quedaba trabada esperándolo.

                            Va antes de que haya comprador a propósito: cumplirlo
                            arranca el plazo, y cuando el plazo se cumple el activo
                            queda marcado como de transferencia inmediata. Así la
                            espera transcurre mientras el activo está en el mercado
                            y no en el medio de una venta ya acordada.
                        */}
                        <Panel title="ACCESO DE LA PLATAFORMA">
                            {mio.transferable ? (
                                <div className="flex flex-col gap-2">
                                    <span className="text-[15px] text-[var(--color-listo)]">
                                        Cedido y fuera del plazo de espera
                                    </span>
                                    <span className="text-[13px] leading-relaxed text-[var(--color-apagado)]">
                                        Tu activo aparece en el mercado como{' '}
                                        <span className="font-mono text-[12px] text-[var(--color-listo)]">
                                            TRANSFERENCIA INMEDIATA
                                        </span>
                                        . Quien compre hoy no espera ningún plazo, y el contrato se
                                        puede firmar el mismo día.
                                    </span>
                                </div>
                            ) : mio.transferableFrom ? (
                                <div className="flex flex-col gap-2">
                                    <span className="text-[15px] text-[var(--color-alerta)]">
                                        En período de espera
                                    </span>
                                    <span className="text-[13px] leading-relaxed text-[var(--color-apagado)]">
                                        Ya nos diste el acceso. El{' '}
                                        {fechaLarga(mio.transferableFrom)} tu activo pasa a figurar
                                        como de transferencia inmediata. Mientras tanto podés
                                        recibir ofertas y negociar normalmente.
                                    </span>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    <p className="text-[13px] leading-relaxed text-[var(--color-apagado)]">
                                        Todavía no nos diste acceso, así que el contrato de venta no
                                        se va a poder firmar. Hacelo ahora y no cuando aparezca un
                                        comprador: el plazo de espera corre igual mientras el activo
                                        está publicado.
                                    </p>

                                    {mio.handoverSteps.length > 0 && (
                                        <ol className="flex flex-col gap-3 border-t border-[var(--color-borde)] pt-4">
                                            {mio.handoverSteps.map((paso, i) => (
                                                <li key={paso.id} className="flex gap-3 text-[13px]">
                                                    <span className="font-mono text-[12px] text-[var(--color-acento)]">
                                                        {i + 1}
                                                    </span>
                                                    <span className="leading-relaxed text-[var(--color-tenue)]">
                                                        {paso.instruction ?? paso.description}
                                                    </span>
                                                </li>
                                            ))}
                                        </ol>
                                    )}

                                    <p className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                                        Cuando lo hagas, avisanos y lo dejamos registrado.{' '}
                                        {listing.descriptor.handoverNotice}
                                    </p>
                                </div>
                            )}
                        </Panel>

                        <Panel title="LOS DATOS PUBLICADOS">
                            <div className="flex flex-col divide-y divide-[var(--color-borde-sutil)]">
                                {/*
                                    El orden y las etiquetas los declara el tipo de activo. La
                                    pantalla no sabe qué campos existen ni cómo se llaman: solo
                                    los dibuja en el orden en que se los dan.
                                */}
                                {listing.descriptor.fields
                                    .filter((f) => f.key in listing.assetData)
                                    .map((f) => (
                                        <div key={f.key} className="flex justify-between gap-4 py-2.5 text-[14px]">
                                            <span className="text-[var(--color-tenue)]">{f.label}</span>
                                            <span className="font-mono">
                                                {fieldValue(f.kind, listing.assetData[f.key])}
                                            </span>
                                        </div>
                                    ))}
                            </div>
                        </Panel>
                    </div>
                </Reveal>
            )}

            {/* ── ESTADO ────────────────────────────────────────── */}
            {pestana === 'estado' && (
                <Reveal>
                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                        <Panel title="QUÉ PODÉS HACER">
                            <div className="flex flex-col gap-4">
                                {(mio.status === 'draft' || mio.status === 'rejected') && (
                                    <>
                                        <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                            Todavía no lo ve nadie. Al enviarlo a revisión lo evaluamos
                                            antes de publicarlo.
                                        </p>
                                        <OperationAction
                                            action={submitForReview.bind(null, id)}
                                            text="Enviar a revisión"
                                        />
                                    </>
                                )}
                                {mio.status === 'under_review' && (
                                    <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                        Lo estamos revisando. Te avisamos cuando salga al mercado.
                                    </p>
                                )}
                                {mio.status === 'published' && (
                                    <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                        Está en el mercado recibiendo ofertas.
                                        {sinResponder > 0
                                            ? ` Tenés ${sinResponder} esperando tu respuesta.`
                                            : ''}
                                    </p>
                                )}
                                {mio.status === 'in_operation' && (
                                    <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                        Aceptaste una oferta, así que salió del mercado y las demás se
                                        cancelaron.
                                    </p>
                                )}
                                {mio.status === 'sold' && (
                                    <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                        Se vendió y el traspaso terminó.
                                    </p>
                                )}

                                <ButtonLink href={`/listings/${id}`} variant="secundario">
                                    Ver la publicación
                                </ButtonLink>
                            </div>
                        </Panel>

                        <Panel title={`SI SE VENDE A ${money(mio.askingPrice)}`}>
                            <div className="flex flex-col gap-3">
                                <div className="flex justify-between text-[14px]">
                                    <span className="text-[var(--color-tenue)]">Precio pedido</span>
                                    <span className="font-mono">{money(mio.askingPrice)}</span>
                                </div>
                                <div className="flex justify-between text-[14px]">
                                    <span className="text-[var(--color-tenue)]">
                                        Comisión de la plataforma (5 %)
                                    </span>
                                    <span className="font-mono text-[var(--color-alerta)]">
                                        −{' '}
                                        {money({
                                            cents: Math.round(mio.askingPrice.cents * COMISION),
                                            currency: mio.askingPrice.currency,
                                        })}
                                    </span>
                                </div>
                                <div className="flex justify-between border-t border-[var(--color-borde)] pt-3 text-[15px]">
                                    <span className="font-medium">Recibís</span>
                                    <span className="font-mono font-bold text-[var(--color-acento)]">
                                        {money({
                                            cents: Math.round(mio.askingPrice.cents * (1 - COMISION)),
                                            currency: mio.askingPrice.currency,
                                        })}
                                    </span>
                                </div>
                            </div>
                        </Panel>
                    </div>
                </Reveal>
            )}
        </div>
    );
}
