import Link from 'next/link';
import type { MyOperationDto, OperationStatusDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { requireCounterparty } from '@/lib/guards';
import { Reveal } from '@/components/Reveal';
import { ButtonLink, OperationStatusBadge, Heading, EmptyState } from '@/components/ui';
import { assetTypeLabel, money, nicheLabel } from '@/lib/format';

export const metadata = { title: 'Mis operaciones · Traspaso' };

/**
 * En qué momento del recorrido está una operación.
 *
 * Son tres grupos y no los nueve estados a propósito: lo que alguien quiere
 * separar de un vistazo es "todavía nos estamos poniendo de acuerdo", "ya nos
 * comprometimos y esto avanza" y "esto terminó". El estado exacto lo sigue
 * diciendo el sello de cada fila.
 */
const ETAPAS = {
    negociando: {
        text: 'En negociación',
        states: ['offer_sent', 'negotiating'] as OperationStatusDto[],
    },
    'en-curso': {
        text: 'En curso',
        states: [
            'contract_pending',
            'contract_signed',
            'transfer_in_progress',
            'asset_in_custody',
            'payment_received',
        ] as OperationStatusDto[],
    },
    cerradas: {
        text: 'Cerradas',
        states: ['completed', 'cancelled'] as OperationStatusDto[],
    },
} as const;

type ClaveDeEtapa = keyof typeof ETAPAS;

const PARTES = { buyer: 'Comprando', seller: 'Vendiendo' } as const;
type ClaveDeParte = keyof typeof PARTES;

function esEtapa(v: unknown): v is ClaveDeEtapa {
    return typeof v === 'string' && v in ETAPAS;
}

function esParte(v: unknown): v is ClaveDeParte {
    return v === 'buyer' || v === 'seller';
}

/** Reconstruye la dirección conservando el otro criterio. */
function href(parte?: ClaveDeParte, etapa?: ClaveDeEtapa): string {
    const q = new URLSearchParams();
    if (parte) q.set('parte', parte);
    if (etapa) q.set('etapa', etapa);
    const s = q.toString();
    return s ? `/operaciones?${s}` : '/operaciones';
}

function Filtro({
    activo,
    href: destino,
    children,
}: {
    activo: boolean;
    href: string;
    children: React.ReactNode;
}) {
    return (
        <Link
            href={destino}
            aria-current={activo ? 'page' : undefined}
            className={`rounded-[var(--radius-chico)] border px-3.5 py-2 text-[13px] transition-colors ${
                activo
                    ? 'border-[var(--color-acento)] text-[var(--color-acento)]'
                    : 'border-[var(--color-borde-fuerte)] text-[var(--color-tenue)] hover:text-[var(--color-tinta)]'
            }`}
        >
            {children}
        </Link>
    );
}

export default async function Operaciones(props: {
    // En Next 16 `searchParams` es una promesa: el acceso sincrónico se eliminó.
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireCounterparty();
    const params = await props.searchParams;

    const parte = esParte(params.parte) ? params.parte : undefined;
    const etapa = esEtapa(params.etapa) ? params.etapa : undefined;

    let todas: MyOperationDto[] = [];
    try {
        todas = await api().misOperaciones();
    } catch {
        todas = [];
    }

    // El filtrado va acá y no en la API porque la lista es de una sola persona
    // y ya viene entera en una llamada: pedirla de nuevo por cada criterio
    // sería un viaje de ida y vuelta para no traer nada que no tengamos.
    const visibles = todas.filter(
        (op) =>
            (!parte || op.miParte === parte) &&
            (!etapa || ETAPAS[etapa].states.includes(op.status)),
    );

    // Los contadores salen del total y no de lo ya filtrado: un filtro que da
    // cero tiene que seguir diciendo cuántas hay del otro lado.
    const cuantas = (p?: ClaveDeParte, e?: ClaveDeEtapa) =>
        todas.filter(
            (op) => (!p || op.miParte === p) && (!e || ETAPAS[e].states.includes(op.status)),
        ).length;

    const fecha = (iso: string) =>
        new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

    return (
        <div className="mx-auto max-w-[1100px] px-6 py-16 sm:px-12">
            <Reveal>
                <Heading sub="Todo lo que estás comprando o vendiendo, con la etapa en la que está cada operación.">
                    Mis operaciones
                </Heading>
            </Reveal>

            {todas.length > 0 && (
                <Reveal delay={60}>
                    <div className="mt-8 flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="mr-1 font-mono text-[12px] tracking-[0.08em] text-[var(--color-tenue)]">
                                POSICIÓN
                            </span>
                            <Filtro activo={!parte} href={href(undefined, etapa)}>
                                Todas · {cuantas(undefined, etapa)}
                            </Filtro>
                            {(Object.keys(PARTES) as ClaveDeParte[]).map((p) => (
                                <Filtro key={p} activo={parte === p} href={href(p, etapa)}>
                                    {PARTES[p]} · {cuantas(p, etapa)}
                                </Filtro>
                            ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <span className="mr-1 font-mono text-[12px] tracking-[0.08em] text-[var(--color-tenue)]">
                                ETAPA
                            </span>
                            <Filtro activo={!etapa} href={href(parte, undefined)}>
                                Todas · {cuantas(parte, undefined)}
                            </Filtro>
                            {(Object.keys(ETAPAS) as ClaveDeEtapa[]).map((e) => (
                                <Filtro key={e} activo={etapa === e} href={href(parte, e)}>
                                    {ETAPAS[e].text} · {cuantas(parte, e)}
                                </Filtro>
                            ))}
                        </div>
                    </div>
                </Reveal>
            )}

            <div className="mt-8">
                {todas.length === 0 ? (
                    <EmptyState
                        title="Todavía no tenés operaciones"
                        text="Cuando ofertes por un activo, o alguien oferte por uno tuyo, la vas a seguir desde acá."
                        action={<ButtonLink href="/listings">Ver el mercado</ButtonLink>}
                    />
                ) : visibles.length === 0 ? (
                    <EmptyState
                        title="Ninguna operación entra en ese filtro"
                        text="Probá con otra combinación, o mirá todas para ver el panorama completo."
                        action={<ButtonLink href="/operaciones">Ver todas</ButtonLink>}
                    />
                ) : (
                    <div className="flex flex-col gap-3">
                        {visibles.map((op, i) => {
                            const miTurno = op.miParte && op.pendingResponseFrom === op.miParte;
                            return (
                                <Reveal key={op.id} delay={Math.min(i, 6) * 70}>
                                    <Link
                                        href={`/operaciones/${op.id}`}
                                        className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-medio)] border border-[var(--color-borde)] bg-[var(--color-superficie)] p-5 transition-colors hover:border-[var(--color-borde-fuerte)]"
                                    >
                                        <div className="flex flex-col gap-2">
                                            <div className="flex flex-wrap items-center gap-2.5">
                                                <OperationStatusBadge state={op.status} />
                                                {miTurno && (
                                                    <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-acento)]">
                                                        TE TOCA RESPONDER
                                                    </span>
                                                )}
                                            </div>
                                            {/*
                                                Antes la fila decía solo la posición y el monto,
                                                así que tres operaciones se distinguían únicamente
                                                por el precio. El rubro y el tipo son datos
                                                públicos del activo: dicen de qué se trata sin
                                                revelar cuál es.
                                            */}
                                            <span className="text-[15px] font-medium text-[var(--color-tinta)]">
                                                {op.niche ? nicheLabel(op.niche) : 'Activo'}
                                                {op.assetType && (
                                                    <span className="text-[var(--color-tenue)]">
                                                        {' · '}
                                                        {assetTypeLabel(op.assetType)}
                                                    </span>
                                                )}
                                            </span>
                                            <span className="text-[14px] text-[var(--color-tenue)]">
                                                {op.miParte === 'buyer' ? 'Estás comprando' : 'Estás vendiendo'}
                                                <span className="text-[var(--color-apagado)]">
                                                    {' · desde el '}
                                                    {fecha(op.createdAt)}
                                                </span>
                                            </span>
                                        </div>

                                        <span className="font-mono text-[21px] font-bold text-[var(--color-acento)]">
                                            {money(op.currentOfferPrice)}
                                        </span>
                                    </Link>
                                </Reveal>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
