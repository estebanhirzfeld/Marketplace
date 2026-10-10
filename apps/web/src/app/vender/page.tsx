import Link from 'next/link';
import { ApiError } from '@marketplace/api-client';
import type { YouTubeConnectionDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { requireCounterparty } from '@/lib/guards';
import { Reveal } from '@/components/Reveal';
import { PublishListingForm } from '@/components/PublishListingForm';
import { VerifiedChannelCard } from '@/components/VerifiedChannelCard';
import { YouTubeConnectStep } from '@/components/YouTubeConnectStep';
import { YouTubeListingForm } from '@/components/YouTubeListingForm';
import { Panel, Heading } from '@/components/ui';
import { formatNumber } from '@/lib/format';
import { parseConnectionReason, type ConnectionFailure } from '@/lib/youtubeConnection';
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
 * Los canales que el vendedor ya conectó.
 *
 * La API responde 503 mientras no están las credenciales de Google: es la única
 * condición en la que existe la carga manual. Cualquier otra falla de lectura
 * se trata como "ninguno todavía": volver a conectar un canal ya conectado lo
 * reutiliza, así que no se pierde nada.
 */
async function loadConnections(): Promise<Connections> {
    try {
        return await api().youTubeConnections();
    } catch (e) {
        if (e instanceof ApiError && e.status === 503) return null;
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
    const manual = !wantsWeb && (connections === null || params.conexion === 'no-configurada');

    const reason = parseConnectionReason(params.conexion);
    const failure: ConnectionFailure | undefined = reason ? { reason, detail: params.detalle } : undefined;

    const channels = connections ?? [];
    const selected =
        channels.find((c) => c.channelId === params.canal) ??
        (channels.length === 1 && !failure ? channels[0] : undefined);

    return (
        <div className="mx-auto max-w-[1100px] px-6 py-16 sm:px-12">
            <Reveal>
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
                                                    className="flex items-baseline justify-between gap-4 rounded-[var(--radius-chico)] border border-[var(--color-borde)] px-4 py-3 transition-colors hover:border-[var(--color-borde-fuerte)]"
                                                >
                                                    <span className="truncate text-[15px] font-medium">{c.channelTitle}</span>
                                                    <span className="shrink-0 text-[13px] text-[var(--color-apagado)]">
                                                        {formatNumber(c.subscribers)} suscriptores
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
