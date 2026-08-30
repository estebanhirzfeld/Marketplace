import Link from 'next/link';
import type { FiltrosDeBusqueda } from './MarketFilters';

/**
 * El orden del mercado, en una barra horizontal sobre la grilla.
 *
 * Son enlaces y no un control de formulario: cada orden tiene su URL, así que
 * se comparte y funciona sin JavaScript. Tocar el criterio que ya está activo
 * invierte la dirección, que es lo que se espera de una cabecera ordenable.
 */

const CRITERIOS = [
    { value: 'published', text: 'Publicación', Icono: IconoReloj },
    { value: 'created', text: 'Antigüedad', Icono: IconoCalendario },
    { value: 'price', text: 'Precio', Icono: IconoEtiqueta },
    { value: 'estimated', text: 'Valuación', Icono: IconoTendencia },
] as const;

type Criterio = (typeof CRITERIOS)[number]['value'];

function href(actuales: FiltrosDeBusqueda, sort: Criterio, direction: 'asc' | 'desc'): string {
    const q = new URLSearchParams();

    const poner = (clave: string, valor: string | number | boolean | undefined) => {
        if (valor !== undefined) q.set(clave, String(valor));
    };

    poner('assetType', actuales.assetType);
    poner('currency', actuales.currency);
    poner('minPrice', actuales.minPrice);
    poner('maxPrice', actuales.maxPrice);
    poner('minSubscribers', actuales.minSubscribers);
    poner('onlyMonetized', actuales.onlyMonetized);
    poner('minDomainAuthority', actuales.minDomainAuthority);
    q.set('sort', sort);
    q.set('direction', direction);

    return `/listings?${q.toString()}`;
}

export function MarketSort({
    actuales,
    cantidad,
}: {
    actuales: FiltrosDeBusqueda;
    cantidad: number;
}) {
    const activo = actuales.sort ?? 'published';
    const direccion = actuales.direction ?? 'desc';

    return (
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-borde)] pb-4">
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 font-mono text-[10px] tracking-[0.1em] text-[var(--color-apagado)]">
                    ORDENAR POR
                </span>

                {CRITERIOS.map(({ value, text, Icono }) => {
                    const esActivo = activo === value;
                    // Tocar el activo invierte; cambiar de criterio arranca de
                    // mayor a menor, que es lo que se espera de cada uno.
                    const proxima = esActivo ? (direccion === 'desc' ? 'asc' : 'desc') : 'desc';

                    return (
                        <Link
                            key={value}
                            href={href(actuales, value, proxima)}
                            aria-current={esActivo ? 'true' : undefined}
                            title={
                                esActivo
                                    ? `${text} — tocá para invertir el orden`
                                    : `Ordenar por ${text.toLowerCase()}`
                            }
                            className={`flex items-center gap-1.5 rounded-[var(--radius-chico)] border px-3 py-1.5 text-[12px] transition-colors ${
                                esActivo
                                    ? 'border-[var(--color-acento)] text-[var(--color-acento)]'
                                    : 'border-transparent text-[var(--color-apagado)] hover:border-[var(--color-borde-fuerte)] hover:text-[var(--color-tinta)]'
                            }`}
                        >
                            <Icono color={esActivo ? 'var(--color-acento)' : 'currentColor'} />
                            {text}
                            {esActivo && <IconoDireccion hacia={direccion} />}
                        </Link>
                    );
                })}
            </div>

            <span className="font-mono text-[11px] text-[var(--color-apagado)]">
                {cantidad} {cantidad === 1 ? 'activo' : 'activos'}
            </span>
        </div>
    );
}

// ── Íconos ───────────────────────────────────────────────
// Trazo y tamaño siguen el mismo criterio que LockIcon: 24 de viewBox,
// `stroke` heredado y sin relleno, para que acompañen al texto.

interface PropsDeIcono {
    tamano?: number;
    color?: string;
}

function svg(hijos: React.ReactNode, { tamano = 13, color = 'currentColor' }: PropsDeIcono) {
    return (
        <svg
            width={tamano}
            height={tamano}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {hijos}
        </svg>
    );
}

function IconoReloj(props: PropsDeIcono) {
    return svg(
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
        </>,
        props,
    );
}

function IconoCalendario(props: PropsDeIcono) {
    return svg(
        <>
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" />
        </>,
        props,
    );
}

function IconoEtiqueta(props: PropsDeIcono) {
    return svg(
        <>
            <path d="M3 12V4h8l10 10-8 8L3 12Z" />
            <circle cx="7.5" cy="7.5" r="1.2" />
        </>,
        props,
    );
}

function IconoTendencia(props: PropsDeIcono) {
    return svg(
        <>
            <path d="M3 17l6-6 4 4 8-8" />
            <path d="M15 7h6v6" />
        </>,
        props,
    );
}

/** La flecha dice hacia dónde crece la lista, no hacia dónde va el enlace. */
function IconoDireccion({ hacia }: { hacia: 'asc' | 'desc' }) {
    return svg(
        hacia === 'asc' ? <path d="M12 20V5M6 11l6-6 6 6" /> : <path d="M12 4v15M6 13l6 6 6-6" />,
        { tamano: 12, color: 'currentColor' },
    );
}
