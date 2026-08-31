import Link from 'next/link';
import type { MyListingDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { requireCounterparty } from '@/lib/guards';
import { Reveal } from '@/components/Reveal';
import { ListingStatusBadge } from '@/components/ListingStatusBadge';
import { ButtonLink, Heading, EmptyState } from '@/components/ui';
import { money, nicheLabel } from '@/lib/format';
import { assetTypeLabeller } from '@/lib/assetTypes';

export const metadata = { title: 'Mis activos · Traspaso' };

/**
 * El resultado de la vuelta del consentimiento de Google. Llega por la
 * dirección porque la vuelta la maneja un route handler, que redirige acá: la
 * verificación se dispara desde un activo, así que corresponde volver al
 * catálogo y no al formulario de publicación.
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

/** Los estados que agrupamos en la barra de filtros. */
const GRUPOS = {
    publicados: { text: 'Publicados', states: ['published', 'in_operation'] },
    borradores: { text: 'Borradores', states: ['draft', 'under_review', 'rejected'] },
    vendidos: { text: 'Vendidos', states: ['sold'] },
} as const;

type ClaveDeGrupo = keyof typeof GRUPOS;

function esGrupo(v: unknown): v is ClaveDeGrupo {
    return typeof v === 'string' && v in GRUPOS;
}

export default async function MisActivos(props: {
    // En Next 16 `searchParams` es una promesa: el acceso sincrónico se eliminó.
    searchParams: Promise<{ verificacion?: string; estado?: string }>;
}) {
    await requireCounterparty();
    const nombreDeTipo = await assetTypeLabeller();
    const params = await props.searchParams;

    const resultado = RESULTADOS[params.verificacion ?? ''];
    const grupo = esGrupo(params.estado) ? params.estado : undefined;

    let todos: MyListingDto[] = [];
    try {
        todos = await api().misListings();
    } catch {
        todos = [];
    }

    const visibles = grupo
        ? todos.filter((l) => (GRUPOS[grupo].states as readonly string[]).includes(l.status))
        : todos;

    const cuantos = (g?: ClaveDeGrupo) =>
        g ? todos.filter((l) => (GRUPOS[g].states as readonly string[]).includes(l.status)).length : todos.length;

    const chip = (activo: boolean) =>
        `rounded-[var(--radius-chico)] border px-3.5 py-2 text-[13px] transition-colors ${
            activo
                ? 'border-[var(--color-acento)] text-[var(--color-acento)]'
                : 'border-[var(--color-borde-fuerte)] text-[var(--color-tenue)] hover:text-[var(--color-tinta)]'
        }`;

    return (
        <div className="mx-auto max-w-[1100px] px-6 py-16 sm:px-12">
            <Reveal>
                <Heading sub="Todo lo que pusiste a la venta, en la etapa en la que está cada uno. Entrá a cualquiera para ver sus ofertas y sus verificaciones.">
                    Mis activos
                </Heading>
            </Reveal>

            {resultado && (
                <div
                    className={`mt-6 rounded-[var(--radius-chico)] border p-4 text-[14px] leading-relaxed ${
                        resultado.ok
                            ? 'border-[var(--color-acento)]/40 text-[var(--color-acento)]'
                            : 'border-[var(--color-alerta)]/40 text-[var(--color-alerta)]'
                    }`}
                >
                    {resultado.text}
                </div>
            )}

            {/* Publicar es una acción, no una pestaña: sale del listado. */}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-2">
                    <Link href="/activos" aria-current={!grupo ? 'page' : undefined} className={chip(!grupo)}>
                        Todos · {cuantos()}
                    </Link>
                    {(Object.keys(GRUPOS) as ClaveDeGrupo[]).map((g) => (
                        <Link
                            key={g}
                            href={`/activos?estado=${g}`}
                            aria-current={grupo === g ? 'page' : undefined}
                            className={chip(grupo === g)}
                        >
                            {GRUPOS[g].text} · {cuantos(g)}
                        </Link>
                    ))}
                </div>
                <ButtonLink href="/vender">Publicar un activo</ButtonLink>
            </div>

            <div className="mt-8">
                {todos.length === 0 ? (
                    <EmptyState
                        title="Todavía no publicaste nada"
                        text="Cargá tu primer activo. Nace como borrador: nadie lo ve hasta que lo envíes a revisión."
                        action={<ButtonLink href="/vender">Publicar un activo</ButtonLink>}
                    />
                ) : visibles.length === 0 ? (
                    <EmptyState
                        title="Ningún activo en esa etapa"
                        text="Probá con otro filtro para ver el resto de tu catálogo."
                        action={<ButtonLink href="/activos">Ver todos</ButtonLink>}
                    />
                ) : (
                    <div className="flex flex-col gap-3">
                        {visibles.map((l, i) => (
                            <Reveal key={l.id} delay={Math.min(i, 6) * 70}>
                                <Link
                                    href={`/activos/${l.id}`}
                                    className="flex flex-wrap items-start justify-between gap-5 rounded-[var(--radius-medio)] border border-[var(--color-borde)] bg-[var(--color-superficie)] p-5 transition-colors hover:border-[var(--color-borde-fuerte)]"
                                >
                                    <div className="flex min-w-[260px] flex-grow flex-col gap-2.5">
                                        <div className="flex flex-wrap items-center gap-2.5">
                                            <ListingStatusBadge state={l.status} />
                                            {l.transferable && (
                                                <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-listo)]">
                                                    TRANSFERENCIA INMEDIATA
                                                </span>
                                            )}
                                        </div>

                                        {/* El activo es suyo, así que su nombre le llega
                                            siempre; el rubro y el tipo quedan de apoyo. */}
                                        <span className="text-[17px] font-medium">
                                            {l.assetName ?? (l.niche ? nicheLabel(l.niche) : 'Activo')}
                                            <span className="text-[var(--color-tenue)]">
                                                {' · '}
                                                {nombreDeTipo(l.assetType)}
                                            </span>
                                        </span>

                                        {/*
                                            La señal que antes había que ir a buscar a otra
                                            pantalla: si falta verificar algo, se ve desde acá.
                                        */}
                                        <span
                                            className={`text-[13px] ${
                                                l.ownership
                                                    ? 'text-[var(--color-listo)]'
                                                    : 'text-[var(--color-alerta)]'
                                            }`}
                                        >
                                            {l.ownership
                                                ? 'Titularidad comprobada'
                                                : 'Falta comprobar la titularidad'}
                                        </span>

                                        {l.rejectionReason && (
                                            <span className="text-[13px] text-[var(--color-error)]">
                                                Rechazado: {l.rejectionReason}
                                            </span>
                                        )}
                                    </div>

                                    <div className="text-right">
                                        <div className="font-mono text-[21px] font-bold text-[var(--color-acento)]">
                                            {money(l.askingPrice)}
                                        </div>
                                        <div className="mt-1 font-mono text-[12px] text-[var(--color-apagado)]">
                                            valuación {money(l.estimatedPrice)}
                                        </div>
                                    </div>
                                </Link>
                            </Reveal>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
