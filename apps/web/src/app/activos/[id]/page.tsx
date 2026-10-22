import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError } from '@marketplace/api-client';
import type {
    ListingDetailDto,
    MyListingDto,
    OfferSummaryDto,
    YouTubeConnectionDto,
} from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { requireCounterparty } from '@/lib/guards';
import { Reveal } from '@/components/Reveal';
import { ListingStatusBadge } from '@/components/ListingStatusBadge';
import { Alert, OperationStatusBadge, Panel, EmptyState, ButtonLink } from '@/components/ui';
import { ChannelAvatar } from '@/components/ChannelAvatar';
import { AccessPanel } from '@/components/AccessPanel';
import { SaleRequirementsPanel } from '@/components/TransferSteps';
import { DraftPanel } from '@/components/DraftPanel';
import { SellMoreAside } from '@/components/SellMoreAside';
import { EditListingDialog } from '@/components/EditListingDialog';
import { DiscardDraftButton } from '@/components/DiscardDraftButton';
import { AssetSummaryCard, OwnershipCheck, OwnershipProof } from '@/components/AssetSummaryCard';
import { WebMark } from '@/components/AssetTypeCard';
import { SendToReviewLink } from '@/components/SendToReviewLink';
import { SellerLevelGauge } from '@/components/SellerLevelGauge';
import { VerificationCards } from '@/components/VerificationCards';
import { VerifiedChannelCard } from '@/components/VerifiedChannelCard';
import { PublishedData } from '@/components/PublishedData';
import { YOUTUBE_CARD_FIELD_KEYS } from '@/lib/publishedFields';
import { currentProfile } from '@/lib/profile';
import { isAccessRegistered, type MercadoPagoState } from '@/lib/sellerLevel';
import { channelIdFromUrl } from '@/lib/youtubeChannel';
import { findOwnershipResult } from '@/lib/ownershipResults';
import { money, nicheLabel } from '@/lib/format';
import {
    checkDomainOwnership,
    getDomainOwnershipChallenge,
    startVerification,
    submitForReview,
} from '../../vender/actions';
import { DnsVerificationTrigger } from '@/components/DnsVerificationTrigger';
import { oauthOwnershipSource, ownershipSourceLabel } from '@/lib/ownershipSource';
import { discardDraft, editListing, publishDraft, requestAccess } from './actions';

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
    const resultado = findOwnershipResult(query.verificacion);
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

    /*
     * La foto y el nombre del canal verificado, solo para el dueño: identifican
     * el canal, así que no viajan en `assetData` ni en nada público. Salen de la
     * conexión del vendedor, buscada por el identificador de la dirección. Si no
     * hay conexión (un activo cargado a mano, o desconectada) simplemente no se
     * muestra.
     */
    let canal: YouTubeConnectionDto | undefined;
    const channelId = channelIdFromUrl(listing.assetData.channelUrl);
    if (pestana === 'verificaciones' && channelId) {
        try {
            canal = (await api().youTubeConnections()).find((c) => c.channelId === channelId);
        } catch {
            canal = undefined;
        }
    }

    // Mercado Pago: solo lo necesitan el borrador (tarjeta lateral) y la pestaña
    // de verificaciones. Si la consulta falla o la API dice 503 se trata como
    // no disponible: no se ofrece vincular algo que no se puede vincular.
    let mercadoPago: MercadoPagoState = 'unavailable';
    const draftish = mio.status === 'draft' || mio.status === 'rejected';
    if (pestana === 'verificaciones' || (pestana === 'estado' && draftish)) {
        try {
            const account = await api().paymentAccountStatus();
            mercadoPago = account.linked ? 'linked' : 'not_linked';
        } catch {
            mercadoPago = 'unavailable';
        }
    }
    const kycVerified = (await currentProfile())?.isKycVerified ?? false;

    // El ingreso mensual que sostiene la valuación: antes tenía un panel propio
    // y ahora es el pie de la tarjeta del canal.
    const ingresoMensual =
        mio.ownership?.monthlyRevenueCents !== undefined ? (
            <>
                Ingreso mensual comprobado:{' '}
                <span className="font-mono text-[var(--color-listo)]">
                    {money({ cents: mio.ownership.monthlyRevenueCents, currency: 'USD' })}
                </span>
                . Lo informa Google, no vos: es el dato que sostiene la valuación.
            </>
        ) : (
            listing.descriptor.revenueNotice
        );

    const sinResponder = offers.filter((o) => o.pendingResponseFrom === 'seller').length;
    const rubro = mio.niche ? nicheLabel(mio.niche) : 'Activo';

    /*
     * Solo los pasos de antes de la venta. Quitar el acceso directo y el
     * propietario principal se piden con el contrato firmado, dentro de la
     * operación: acá mostrarlos asusta sin que haya nada que hacer todavía.
     */
    const listingSteps = mio.handoverSteps.filter((p) => (p.phase ?? 'listing') === 'listing');
    const cuentaDeCustodia = mio.custodyAccountIdentifier;
    const guided =
        mio.assetType === 'youtube' &&
        !!cuentaDeCustodia &&
        listingSteps.length === 2 &&
        listingSteps.every((p) => p.details && p.details.length > 0);
    const accessRegistered = mio.transferable || isAccessRegistered(mio.platformAccessStatus);
    // Un sitio no usa el acceso de la plataforma: entra en custodia por un
    // traslado del dominio. Nada del acceso se le muestra a su vendedor.
    const requiresAccess = listing.descriptor.requiresPlatformAccess;
    const sourceLabel = ownershipSourceLabel(listing.descriptor.ownershipSource);
    const accessHref = `/activos/${id}?ver=verificaciones#acceso`;
    const subject = mio.assetType === 'youtube' ? 'canal' : 'sitio';
    // Con DNS no se redirige a Google: el diálogo ofrece AdSense como alternativa.
    const verifyAction = startVerification.bind(null, id, oauthOwnershipSource(listing.descriptor.ownershipSource));
    // El registro se pide al abrir el diálogo y no acá: resolver los servidores
    // de nombres es una consulta de red que no vale pagar en cada visita.
    const dnsSource = listing.descriptor.ownershipSource === 'dns';
    const dnsTrigger = (className: string) =>
        dnsSource ? (
            <DnsVerificationTrigger
                className={className}
                getChallenge={getDomainOwnershipChallenge.bind(null, id)}
                checkAction={checkDomainOwnership.bind(null, id)}
                adsenseAction={startVerification.bind(null, id, 'adsense')}
                // Al comprobarse, el diálogo ofrece publicar sin salir de él.
                publishAction={mio.status === 'draft' ? publishDraft.bind(null, id) : undefined}
            />
        ) : undefined;
    const isWeb = mio.assetType === 'web';
    const domain = typeof listing.assetData.domain === 'string' ? listing.assetData.domain : '';
    const now = new Date().toISOString();
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
                        {(draftish || mio.status === 'published') && (
                            <div className="mt-4 flex flex-wrap items-start justify-end gap-2">
                                <EditListingDialog
                                    action={editListing.bind(null, id, mio.status)}
                                    scope={draftish ? 'listing' : 'price'}
                                    niche={mio.niche}
                                    noFace={listing.assetData.hasNoFaceContent === true}
                                    showNoFace={mio.assetType === 'youtube'}
                                    priceCents={mio.askingPrice.cents}
                                    currency={mio.askingPrice.currency}
                                />
                                {draftish && <DiscardDraftButton action={discardDraft.bind(null, id)} />}
                            </div>
                        )}
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
                    {/* La vuelta de Google trae el resultado en la dirección. */}
                    {query.verificacion !== 'no-configurada' && resultado && (
                        <div className="mt-6">
                            <Alert tono={resultado.ok ? 'listo' : 'alerta'}>
                                {resultado.text}
                            </Alert>
                        </div>
                    )}
                    {query.verificacion === 'no-configurada' && (
                        <div className="mt-6 rounded-[var(--radius-chico)] border border-[var(--color-alerta)]/40 p-4 text-[14px] leading-relaxed text-[var(--color-alerta)]">
                            La verificación con Google todavía no está configurada en este entorno,
                            así que no pudimos empezarla.
                        </div>
                    )}
                    <div className="mt-6 grid gap-4 lg:grid-cols-[5fr_2fr]">
                        {canal ? (
                            <VerifiedChannelCard channel={canal} avatarShape="square" />
                        ) : (
                            <AssetSummaryCard
                                name={nombre}
                                subtitle={isWeb ? [domain, rubro].filter(Boolean).join(' · ') : listing.descriptor.label}
                                note={isWeb ? undefined : ingresoMensual}
                                mark={isWeb ? <WebMark width={52} /> : undefined}
                            >
                                {dnsSource &&
                                    (mio.ownership ? (
                                        <OwnershipProof sourceLabel={ownershipSourceLabel(mio.ownership.source)} />
                                    ) : (
                                        <OwnershipCheck
                                            action={dnsTrigger('min-h-11 px-[18px] py-3')}
                                            alternative={
                                                mio.status === 'draft' ? (
                                                    <SendToReviewLink action={submitForReview.bind(null, id)} />
                                                ) : undefined
                                            }
                                        />
                                    ))}
                            </AssetSummaryCard>
                        )}
                        <SellerLevelGauge assetType={mio.assetType} ownershipVerified={!!mio.ownership} accessRegistered={accessRegistered} accessApplies={requiresAccess} mercadoPago={mercadoPago} />
                    </div>

                    <div className="mt-4 flex flex-col gap-4">
                        <VerificationCards
                            ownership={{
                                done: !!mio.ownership,
                                sourceLabel: ownershipSourceLabel(mio.ownership?.source ?? ''),
                                verifiedAt: mio.ownership?.verifiedAt,
                            }}
                            access={requiresAccess ? { done: accessRegistered } : undefined}
                            mercadoPago={{ done: mercadoPago === 'linked', unavailable: mercadoPago === 'unavailable' }}
                            ownershipSource={sourceLabel}
                            kycVerified={kycVerified}
                            verifyAction={verifyAction}
                            dnsVerification={dnsTrigger('px-[18px] py-3')}
                        />

                        {/*
                            Acá vive el trabajo real del vendedor antes de la venta.
                            Va antes de que haya comprador a propósito: el plazo corre
                            mientras el activo está publicado, y cuando se cumple queda
                            marcado como de transferencia inmediata.
                        */}
                        {!requiresAccess && <SaleRequirementsPanel steps={listingSteps} />}
                        {requiresAccess && listingSteps.length > 0 && (
                            <AccessPanel
                                listingId={id}
                                subject={subject}
                                waitingDays={listing.descriptor.transferWaitingDays}
                                steps={listingSteps}
                                email={cuentaDeCustodia}
                                status={mio.transferable ? 'immediate' : mio.platformAccessStatus}
                                transferableFrom={mio.transferableFrom}
                                guided={guided}
                                now={now}
                                requestAction={requestAccess.bind(null, id)}
                            />
                        )}
                    </div>

                    <div className="mt-4">
                        <PublishedData
                            fields={listing.descriptor.fields}
                            data={listing.assetData}
                            exclude={mio.assetType === 'youtube' ? YOUTUBE_CARD_FIELD_KEYS : undefined}
                        />
                    </div>
                </Reveal>
            )}

            {/* ── ESTADO ────────────────────────────────────────── */}
            {pestana === 'estado' && (
                <Reveal>
                    {draftish && (
                        <div className="mt-6 grid items-start gap-5 lg:grid-cols-[3fr_2fr]">
                            <DraftPanel
                                variant={
                                    mio.status === 'rejected' ? 'rejected' : mio.ownership ? 'ready' : 'unverified'
                                }
                                subject={subject}
                                sourceLabel={sourceLabel}
                                price={money(mio.askingPrice)}
                                kycVerified={kycVerified}
                                rejectionReason={mio.rejectionReason}
                                publishAction={publishDraft.bind(null, id)}
                                reviewAction={submitForReview.bind(null, id)}
                                verifyAction={verifyAction}
                                dnsVerification={dnsTrigger('min-h-[52px] px-7 text-[16px]')}
                            />
                            {mio.status === 'draft' && (
                                <SellMoreAside
                                            accessHref={accessHref}
                                            subject={subject}
                                            showAccess={requiresAccess && mio.platformAccessStatus === 'pending'}
                                    showMercadoPago={mercadoPago === 'not_linked'}
                                />
                            )}
                        </div>
                    )}
                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                        {!draftish && (
                        <Panel title="QUÉ PODÉS HACER">
                            <div className="flex flex-col gap-4">
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
                        )}

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
