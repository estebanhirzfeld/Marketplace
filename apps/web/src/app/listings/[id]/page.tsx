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
import { ButtonLink, OperationStatusBadge, Panel } from '@/components/ui';
import { LockIcon } from '@/components/LockIcon';
import { money, formatNumber, percentage } from '@/lib/format';
import { signNda, makeOffer } from './actions';
import { registerPlatformAccess, revokePlatformAccess } from '../../admin/actions';

/** Nombres legibles para las claves crudas que devuelve la strategy. */
/**
 * Las claves son las de `assetData`, tal como las emite cada estrategia. Si
 * alguna no está acá, la pantalla mostraría el nombre técnico del campo.
 */
const ETIQUETAS: Record<string, string> = {
    subscribers: 'Suscriptores',
    monthlyRevenueUsdCents: 'Ingreso mensual',
    currency: 'Moneda',
    growthFactor: 'Factor de crecimiento',
    isMonetized: 'Monetizado',
    audienceTopCountry: 'País principal de la audiencia',
    hasNoFaceContent: 'Contenido sin rostro',
    channelUrl: 'Dirección del canal',
    domainAuthority: 'Autoridad de dominio',
    domain: 'Dominio',
};

function readableValue(key: string, value: unknown): string {
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (key === 'monthlyRevenueUsdCents' && typeof value === 'number') {
        return money({ cents: value, currency: 'USD' });
    }
    if (key === 'engagementRate' && typeof value === 'number') return percentage(value);
    if (typeof value === 'number') return formatNumber(value);
    return String(value);
}

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
    const visibleFields = Object.entries(listing.assetData);

    return (
        <div className="mx-auto max-w-[1400px] px-6 py-14 sm:px-12">
            <Reveal>
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <OperationStatusBadge state="offer_sent" />
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
                {/* Datos del activo */}
                <Reveal>
                    <Panel title="DATOS DEL ACTIVO">
                        <div className="flex flex-col divide-y divide-[var(--color-borde-sutil)]">
                            {visibleFields.map(([key, value]) => (
                                <div key={key} className="flex items-center justify-between py-3 text-[14px]">
                                    <span className="text-[var(--color-tenue)]">
                                        {ETIQUETAS[key] ?? key}
                                    </span>
                                    <span className="font-mono">{readableValue(key, value)}</span>
                                </div>
                            ))}

                            {/* Los campos ocultos se muestran como filas ciegas: el
                                comprador ve qué le falta, no un vacío inexplicable. */}
                            {listing.hiddenFields.map((campo) => (
                                <div key={campo} className="flex items-center justify-between py-3 text-[14px]">
                                    <span className="text-[var(--color-tenue)]">
                                        {ETIQUETAS[campo] ?? campo}
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
                </Reveal>

                {/* Acción */}
                <Reveal delay={100}>
                    <div className="flex flex-col gap-5">
                        {hidden && (
                            <NdaPanel
                                action={signNda.bind(null, id)}
                                hiddenFields={listing.hiddenFields.map((c) => ETIQUETAS[c] ?? c)}
                                authenticated={Boolean(actor)}
                            />
                        )}

                        <TransferStatus
                            transferable={listing.transferable}
                            transferableFrom={listing.transferableFrom}
                        />

                        {actor?.role === UserRole.ADMIN && (
                            <Panel title="ACCESO DE LA PLATAFORMA">
                                <PlatformAccessForm
                                    registerUser={registerPlatformAccess.bind(null, id)}
                                    revocar={revokePlatformAccess.bind(null, id)}
                                    transferable={listing.transferable}
                                    transferableFrom={listing.transferableFrom}
                                />
                            </Panel>
                        )}

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
                    </div>
                </Reveal>
            </div>
        </div>
    );
}
