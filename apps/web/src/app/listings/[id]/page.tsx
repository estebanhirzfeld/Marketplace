import { notFound } from 'next/navigation';
import { ApiError } from '@marketplace/api-client';
import type { ListingDetailDto } from '@marketplace/api-contract';
import { UserRole } from '@marketplace/shared-types';
import { api } from '@/lib/api';
import { currentActor } from '@/lib/session';
import { Reveal } from '@/components/Reveal';
import { NdaPanel } from '@/components/NdaPanel';
import { TransferStatus } from '@/components/Transferability';
import { PlatformAccessForm } from '@/components/PlatformAccessForm';
import { OfferForm } from '@/components/OfferForm';
import { ButtonLink, Panel } from '@/components/ui';
import { ListingStatusBadge } from '@/components/ListingStatusBadge';
import { LockIcon } from '@/components/LockIcon';
import { fieldValue, money } from '@/lib/format';
import { signNda, makeOffer } from './actions';
import { registerPlatformAccess, revokePlatformAccess } from '../../admin/actions';

export default async function DetalleListing(props: { params: Promise<{ id: string }> }) {
    // En Next 16 `params` es una promesa: el acceso sincrónico se eliminó.
    const { id } = await props.params;

    const actor = await currentActor();

    let listing: ListingDetailDto;
    try {
        listing = await api().listing(id);
    } catch (e) {
        if (e instanceof ApiError && e.code === 'NOT_FOUND') notFound();
        throw e;
    }

    const hidden = listing.hiddenFields.length > 0;
    // Solo un activo publicado admite ofertas. El dominio ya lo rechaza
    // (`Solo se puede ofertar sobre activos publicados`), pero la pantalla lo
    // ofrecía igual y la persona se enteraba recién al apretar.
    const disponible = listing.status === 'published';
    // Los campos ocultos llegan como claves crudas; el descriptor les pone
    // nombre. Si el tipo no describe alguno, se muestra la clave antes que nada.
    const etiqueta = (clave: string) =>
        listing.descriptor.fields.find((f) => f.key === clave)?.label ?? clave;

    return (
        <div className="mx-auto max-w-[1400px] px-6 py-14 sm:px-12">
            <Reveal>
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                        {/*
                            Era `OperationStatusBadge state="offer_sent"` fijo: un
                            estado de OPERACIÓN pintado sobre un ACTIVO, igual en el
                            100 % de las publicaciones. No informaba nada y encima
                            mentía sobre activos ya vendidos.
                        */}
                        <ListingStatusBadge state={listing.status} />
                        {hidden && (
                            <span className="flex items-center gap-1.5 rounded-[var(--radius-chico)] border border-[var(--color-alerta)]/40 px-2.5 py-1">
                                <LockIcon />
                                <span className="font-mono text-[10px] text-[var(--color-alerta)]">
                                    CONFIDENCIAL
                                </span>
                            </span>
                        )}
                    </div>
                    <h1 className="text-[32px] font-bold tracking-[-0.03em] sm:text-[40px]">
                        {money(listing.askingPrice)}
                    </h1>
                    <p className="text-[15px] text-[var(--color-tenue)]">
                        Valuación estimada por nuestra fórmula:{' '}
                        <span className="font-mono text-[var(--color-tinta)]">
                            {money(listing.estimatedPrice)}
                        </span>
                    </p>
                </div>
            </Reveal>

            <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                {/*
                    Los datos del activo y, debajo, el acuerdo que los desbloquea:
                    el panel del NDA vive junto a las filas borroneadas que promete
                    revelar, y no en la columna de acciones donde competía con la
                    oferta.
                */}
                <Reveal className="grid gap-6">
                    <Panel title="DATOS DEL ACTIVO">
                        <div className="flex flex-col divide-y divide-[var(--color-borde-sutil)]">
                            {listing.descriptor.fields
                                .filter((f) => f.key in listing.assetData)
                                .map((f) => (
                                    <div key={f.key} className="flex items-center justify-between py-3 text-[14px]">
                                        <span className="text-[var(--color-tenue)]">{f.label}</span>
                                        <span className="font-mono">
                                            {fieldValue(f.kind, listing.assetData[f.key])}
                                        </span>
                                    </div>
                                ))}

                            {/* Los campos ocultos se muestran como filas ciegas: el
                                comprador ve qué le falta, no un vacío inexplicable. */}
                            {listing.hiddenFields.map((campo) => (
                                <div key={campo} className="flex items-center justify-between py-3 text-[14px]">
                                    <span className="text-[var(--color-tenue)]">
                                        {etiqueta(campo)}
                                    </span>
                                    <span className="flex items-center gap-2">
                                        <LockIcon tamano={12} color="var(--color-fantasma)" />
                                        <span className="select-none font-mono text-[var(--color-fantasma)] blur-[3px]">
                                            ████████
                                        </span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </Panel>
                    {hidden && (
                        <NdaPanel
                            action={signNda.bind(null, id)}
                            hiddenFields={listing.hiddenFields.map(etiqueta)}
                            authenticated={Boolean(actor)}
                        />
                    )}
                </Reveal>

                {/* Acción */}
                <Reveal delay={100}>
                    <div className="flex flex-col gap-5">
                        <TransferStatus
                            transferable={listing.transferable}
                            transferableFrom={listing.transferableFrom}
                            waitingNotice={listing.descriptor.waitingNotice}
                        />

                        {actor?.role === UserRole.ADMIN && (
                            <Panel title="ACCESO DE LA PLATAFORMA">
                                <PlatformAccessForm
                                    registerUser={registerPlatformAccess.bind(null, id)}
                                    revocar={revokePlatformAccess.bind(null, id)}
                                    transferable={listing.transferable}
                                    transferableFrom={listing.transferableFrom}
                                    handoverSteps={listing.handoverSteps}
                                />
                            </Panel>
                        )}

                        {/*
                            El formulario se muestra solo a quien realmente puede
                            ofertar. Antes aparecía siempre: el vendedor lo veía
                            sobre su propio activo y la API le respondía que no,
                            así que la pantalla ofrecía algo que el negocio
                            prohíbe y la persona se enteraba recién al apretar.
                        */}
                        {listing.isOwnedByViewer ? (
                            <Panel title="ESTE ACTIVO ES TUYO">
                                <div className="flex flex-col gap-4">
                                    <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                        Así es como ven tu publicación los compradores. Las ofertas
                                        que recibas te esperan en tu panel.
                                    </p>
                                    <ButtonLink href={`/vender/${id}/ofertas`} className="w-full">
                                        Ver las ofertas recibidas
                                    </ButtonLink>
                                </div>
                            </Panel>
                        ) : actor?.role === UserRole.ADMIN ? (
                            <Panel title="ESTÁS COMO PLATAFORMA">
                                <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                    La plataforma no compra ni vende. Tu rol acá es verificar el
                                    acceso al activo y su custodia, y por eso ves los datos
                                    reservados sin firmar el acuerdo de confidencialidad.
                                </p>
                            </Panel>
                        ) : !disponible ? (
                            <Panel title="YA NO ESTÁ DISPONIBLE">
                                <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                    {listing.status === 'sold'
                                        ? 'Este activo ya se vendió. Lo dejamos visible para que las partes puedan volver a su operación.'
                                        : 'Este activo tiene una operación en curso, así que no está recibiendo ofertas.'}
                                </p>
                            </Panel>
                        ) : (
                            <Panel title="HACER UNA OFERTA">
                                {actor ? (
                                    <OfferForm
                                        action={makeOffer.bind(null, id)}
                                        askingPrice={Math.round(listing.askingPrice.cents / 100)}
                                    />
                                ) : (
                                    <div className="flex flex-col gap-4">
                                        <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                            Necesitás una cuenta para ofertar. Crearla es gratis y no te
                                            compromete a nada.
                                        </p>
                                        <ButtonLink href="/ingresar" className="w-full">
                                            Ingresar para ofertar
                                        </ButtonLink>
                                    </div>
                                )}
                            </Panel>
                        )}
                    </div>
                </Reveal>
            </div>
        </div>
    );
}
