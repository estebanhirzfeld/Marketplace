import Link from 'next/link';
import type { YouTubeConnectionDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { requireCounterparty } from '@/lib/guards';
import { Reveal } from '@/components/Reveal';
import { PublishListingForm } from '@/components/PublishListingForm';
import { VerifiedChannelCard } from '@/components/VerifiedChannelCard';
import { YouTubeConnectStep } from '@/components/YouTubeConnectStep';
import { YouTubeListingForm } from '@/components/YouTubeListingForm';
import { AssetTypeCard, WebLogo, YouTubeLogo } from '@/components/AssetTypeCard';
import { DraftChoice } from '@/components/DraftChoice';
import { SellSteps } from '@/components/SellSteps';
import { Panel, Heading } from '@/components/ui';
import { subscribersLabel } from '@/lib/format';
import { ChannelAvatar } from '@/components/ChannelAvatar';
import { planYouTubeSell } from '@/lib/sellChannels';
import {
    chooseSellView,
    connectionsFromReadError,
    isTypePick,
    parseConnectionReason,
    type ConnectionFailure,
} from '@/lib/youtubeConnection';
import {
    createYouTubeListing,
    estimateListingPrice,
    publishListing,
    startYouTubeConnection,
} from './actions';

export const metadata = { title: 'Publicar un activo · Traspaso' };

type Connections =
    // `null`: la integración con YouTube no está configurada.
    YouTubeConnectionDto[] | null;

/**
 * Los canales que el vendedor ya conectó. La decisión de qué hacer con una
 * falla de lectura está en `connectionsFromReadError`.
 *
 * Nota: la web no tiene un registro de errores del servidor (solo los
 * `console.error` de las pantallas de error), así que una falla distinta de 503
 * se trata como lista vacía sin dejar rastro.
 */
async function loadConnections(): Promise<Connections> {
    try {
        return await api().youTubeConnections();
    } catch (e) {
        return connectionsFromReadError(e);
    }
}

/** Los activos del vendedor, para saber qué canales ya tienen uno. Sin ellos, no se filtra nada. */
async function loadMyListings() {
    try {
        return await api().misListings();
    } catch {
        return [];
    }
}

/**
 * La lectura de Google con la forma que espera la valuación: los mismos campos
 * con los que la API arma el activo al crearlo.
 */
function verifiedValuationData(c: YouTubeConnectionDto): Record<string, unknown> {
    return {
        subscribers: c.subscribers,
        monthlyRevenueUsdCents: c.monthlyRevenueCents,
        isMonetized: c.isMonetized,
        // 1 es el valor neutro de la fórmula, el mismo que usa la API.
        growthFactor: 1,
        ...(c.topCountry ? { audienceTopCountry: c.topCountry } : {}),
    };
}

/**
 * Publicar y nada más.
 *
 * El canal de YouTube se publica conectándolo primero: los números los lee
 * Google y el vendedor completa solo lo que Google no sabe. El formulario
 * manual existe únicamente para el sitio web y para cuando la integración con
 * YouTube no está configurada.
 */
export default async function Publicar(props: {
    // En Next 16 `searchParams` es una promesa: el acceso sincrónico se eliminó.
    searchParams: Promise<{ canal?: string; conexion?: string; detalle?: string; tipo?: string }>;
}) {
    await requireCounterparty();
    const params = await props.searchParams;

    const wantsWeb = params.tipo === 'web';
    const connections = wantsWeb ? [] : await loadConnections();

    const reason = parseConnectionReason(params.conexion);
    const failure: ConnectionFailure | undefined = reason ? { reason, detail: params.detalle } : undefined;

    const myListings = connections && connections.length > 0 ? await loadMyListings() : [];
    const plan = planYouTubeSell(connections ?? [], myListings);
    // Los canales con un activo (publicado o en borrador) no se ofrecen como nuevos.
    const offerable = plan.kind === 'offer' ? plan.channels : plan.kind === 'draft-choice' ? plan.offerable : [];

    const view = chooseSellView({
        connections: connections === null ? null : offerable,
        canal: params.canal,
        failed: failure !== undefined,
        web: wantsWeb,
        notConfigured: params.conexion === 'no-configurada',
    });
    const manual = view.kind === 'manual';
    const picking = isTypePick({
        tipo: params.tipo,
        canal: params.canal,
        failed: failure !== undefined,
        notConfigured: params.conexion === 'no-configurada',
        configured: connections !== null,
    });
    const channels = view.kind === 'list' ? view.channels : offerable;
    const selected = view.kind === 'selected' ? view.channel : undefined;

    if (picking) {
        // Con canales ya conectados se elige entre ellos; sin ninguno, la
        // tarjeta abre Google directamente.
        const hasConnections = plan.kind !== 'connect';
        return (
            <div className="mx-auto max-w-[1100px] px-6 py-16 sm:px-12">
                <Reveal>
                    <div className="flex flex-col gap-2">
                        <span className="font-mono text-[12px] tracking-[0.14em] text-[var(--color-apagado)]">
                            VENDER
                        </span>
                        <h1 className="text-[30px] font-bold tracking-[-0.03em] sm:text-[36px]">
                            ¿Qué querés vender?
                        </h1>
                    </div>
                </Reveal>
                <Reveal delay={80}>
                    <div className="mt-10 grid gap-5 sm:grid-cols-2">
                        <AssetTypeCard
                            logo={<YouTubeLogo />}
                            title="Canal de YouTube"
                            description="Conectás tu canal y traemos los números directo de YouTube. No tipeás nada."
                            cta="Conectar YouTube →"
                            {...(hasConnections
                                ? { href: '/vender?tipo=youtube' }
                                : { action: startYouTubeConnection })}
                        />
                        <AssetTypeCard
                            logo={<WebLogo />}
                            title="Sitio web"
                            description="Cargás los datos del sitio y comprobás que es tuyo con un registro en tu DNS."
                            cta="Cargar sitio →"
                            href="/vender?tipo=web"
                        />
                    </div>
                    <p className="mt-6 text-[14px] text-[var(--color-apagado)]">
                        Próximamente: cuentas de redes sociales.
                    </p>
                </Reveal>
            </div>
        );
    }

    // Un canal con borrador: seguir con ese o traer otro. Mantiene el
    // indicador de pasos y la salida a «Cambiar tipo» de los demás recorridos.
    if (plan.kind === 'draft-choice' && !selected && !failure && !manual && !wantsWeb) {
        return (
            <div className="mx-auto max-w-[1100px] px-6 py-16 sm:px-12">
                <Reveal>
                    <div className="mb-8 flex max-w-[720px] flex-col gap-5">
                        <div className="flex items-center justify-between">
                            <Link href="/vender" className="text-[14px] text-[var(--color-tenue)] hover:text-[var(--color-tinta)]">
                                ← Cambiar tipo
                            </Link>
                            <span className="text-[14px] text-[var(--color-tenue)]">Canal de YouTube</span>
                        </div>
                        <SellSteps labels={['1 · CONECTAR', '2 · COMPLETAR', '3 · PRECIO']} current={0} />
                    </div>
                </Reveal>
                <Reveal delay={80}>
                    <DraftChoice
                        channelTitle={plan.channelTitle}
                        thumbnailUrl={plan.thumbnailUrl}
                        hasPrice={plan.draftHasPrice}
                        draftHref={`/activos/${plan.draftListingId}`}
                        connectAction={startYouTubeConnection}
                    />
                </Reveal>
            </div>
        );
    }

    // Los pasos solo existen donde el flujo es de un tipo; la carga manual
    // ofrece los dos y no tiene un recorrido propio.
    const steps = wantsWeb
        ? { labels: ['1 · DATOS', '2 · PRECIO', '3 · COMPROBAR'], current: 0, kind: 'Sitio web' }
        : !manual
          ? { labels: ['1 · CONECTAR', '2 · COMPLETAR', '3 · PRECIO'], current: selected ? 1 : 0, kind: 'Canal de YouTube' }
          : null;

    return (
        <div className="mx-auto max-w-[1100px] px-6 py-16 sm:px-12">
            <Reveal>
                {steps && (
                    <div className="mb-8 flex max-w-[720px] flex-col gap-5">
                        <div className="flex items-center justify-between">
                            <Link href="/vender" className="text-[14px] text-[var(--color-tenue)] hover:text-[var(--color-tinta)]">
                                ← Cambiar tipo
                            </Link>
                            <span className="text-[14px] text-[var(--color-tenue)]">{steps.kind}</span>
                        </div>
                        <SellSteps labels={steps.labels} current={steps.current} />
                    </div>
                )}
                <div className="flex items-center gap-2 text-[13px] text-[var(--color-apagado)]">
                    <Link href="/activos" className="hover:text-[var(--color-tinta)]">
                        Mis activos
                    </Link>
                    <span>/</span>
                    <span className="text-[var(--color-tenue)]">Publicar</span>
                </div>

                <div className="mt-4">
                    <Heading
                        sub={
                            wantsWeb || manual
                                ? 'Publicá un activo nuevo. Los que ya cargaste están en Mis activos.'
                                : 'Conectá tu canal y publicalo con los números que lee YouTube. Los que ya cargaste están en Mis activos.'
                        }
                    >
                        {wantsWeb ? 'Publicar un sitio web' : manual ? 'Publicar un activo' : 'Publicar un canal'}
                    </Heading>
                </div>
            </Reveal>

            <div className="mt-10 max-w-[720px]">
                {wantsWeb || manual ? (
                    <>
                        <Reveal delay={80}>
                            <Panel title="NUEVO ACTIVO">
                                <PublishListingForm
                                    action={publishListing}
                                    estimate={estimateListingPrice}
                                    types={wantsWeb ? ['web'] : ['youtube', 'web']}
                                />
                            </Panel>
                        </Reveal>
                        <Reveal delay={140}>
                            <p className="mt-5 text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                Se guarda como borrador. Al enviarlo a revisión lo evaluamos antes
                                de publicarlo, y en ese momento te pedimos el acceso al activo.
                            </p>
                            {wantsWeb && (
                                <p className="mt-3 text-[14px]">
                                    <Link href="/vender" className="text-[var(--color-acento)] hover:underline">
                                        Publicar un canal de YouTube
                                    </Link>
                                </p>
                            )}
                        </Reveal>
                    </>
                ) : selected ? (
                    <>
                        <Reveal delay={80}>
                            <VerifiedChannelCard channel={selected} />
                        </Reveal>
                        <Reveal delay={120}>
                            <div className="mt-6">
                                <Panel>
                                    <YouTubeListingForm
                                        action={createYouTubeListing.bind(null, selected.channelId)}
                                        estimate={estimateListingPrice}
                                        verifiedData={verifiedValuationData(selected)}
                                    />
                                </Panel>
                            </div>
                        </Reveal>
                        <Reveal delay={160}>
                            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
                                <YouTubeConnectStep startAction={startYouTubeConnection} hasConnections />
                                {channels.length > 1 && (
                                    <Link href="/vender" className="text-[14px] text-[var(--color-tenue)] hover:text-[var(--color-tinta)]">
                                        Elegir otro canal
                                    </Link>
                                )}
                            </div>
                        </Reveal>
                    </>
                ) : (
                    <>
                        <Reveal delay={80}>
                            <Panel title={channels.length > 0 ? 'ELEGÍ UN CANAL' : 'CONECTÁ TU CANAL'}>
                                {channels.length > 0 && (
                                    <ul className="mb-5 flex flex-col gap-2.5">
                                        {channels.map((c) => (
                                            <li key={c.channelId}>
                                                <Link
                                                    href={`/vender?canal=${encodeURIComponent(c.channelId)}`}
                                                    className="flex items-center gap-4 rounded-[var(--radius-chico)] border border-[var(--color-borde)] px-4 py-3 transition-colors hover:border-[var(--color-borde-fuerte)]"
                                                >
                                                    <ChannelAvatar src={c.thumbnailUrl} name={c.channelTitle} />
                                                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{c.channelTitle}</span>
                                                    <span className="shrink-0 text-[13px] text-[var(--color-apagado)]">
                                                        {subscribersLabel(c.subscribers)}
                                                    </span>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <YouTubeConnectStep
                                    startAction={startYouTubeConnection}
                                    failure={failure}
                                    hasConnections={channels.length > 0}
                                />
                            </Panel>
                        </Reveal>
                        <Reveal delay={140}>
                            <p className="mt-5 text-[14px] text-[var(--color-tenue)]">
                                ¿Vendés un sitio web?{' '}
                                <Link href="/vender?tipo=web" className="text-[var(--color-acento)] hover:underline">
                                    Cargalo acá
                                </Link>
                            </p>
                        </Reveal>
                    </>
                )}
            </div>
        </div>
    );
}
