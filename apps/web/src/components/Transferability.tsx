/**
 * Cuándo se puede cerrar la operación sobre este activo.
 *
 * Nunca dice "listo" a secas. La plataforma no puede comprobar por API que
 * sigue teniendo el acceso, así que lo único honesto es mostrar la fecha del
 * cálculo y dejar que quien mira saque su conclusión.
 *
 * El motivo de la espera lo pone el tipo de activo, no este componente: acá
 * decía "YouTube exige esperar siete días" para cualquier activo, incluido un
 * sitio web que se transfiere de inmediato y no tiene ninguna espera.
 */

import { fechaSinAnioActual } from '@/lib/format';

const FORMATO: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };

export function fechaCorta(iso: string): string {
    return new Date(iso).toLocaleDateString('es-AR', FORMATO);
}

/** Versión compacta, para la grilla. */
export function TransferableBadge({
    transferable,
    transferableFrom,
}: {
    transferable: boolean;
    transferableFrom?: string;
}) {
    if (transferable) {
        return (
            <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-listo)] italic">
                TRANSFERENCIA INMEDIATA
            </span>
        );
    }

    // Sin acceso registrado no se muestra nada: la mayoría de los listings
    // están así y un cartel de "no disponible" en todos sería solo ruido.
    if (!transferableFrom) return null;

    return (
        <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-apagado)]">
            DESDE EL {fechaCorta(transferableFrom).toUpperCase()}
        </span>
    );
}

/**
 * Versión para el detalle del activo.
 *
 * La lee un comprador, a veces sin sesión: una línea con lo que le importa
 * (desde cuándo se cierra y que puede ofertar ya). Las reglas de la
 * custodia y los plazos del tipo de activo son cosa de la plataforma y del
 * vendedor, y no se explican acá.
 */
export function TransferStatus({
    transferable,
    transferableFrom,
    now,
}: {
    transferable: boolean;
    transferableFrom?: string;
    /** La hora de afuera, para que el año de la fecha no dependa del reloj. */
    now?: string;
}) {
    if (transferable) {
        return (
            <Block
                icon={
                    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M11 2h7l-4 7h5L8 22l2.5-9H6z" fill="var(--color-acento)" />
                    </svg>
                }
                title="TRANSFERENCIA INMEDIATA"
                accent
            >
                Si cerrás hoy, el traspaso empieza hoy.
            </Block>
        );
    }

    return (
        <Block icon={<CalendarIcon />} title={transferableFrom ? `Se transfiere desde el ${fechaSinAnioActual(transferableFrom, now ? new Date(now) : undefined)}` : 'Transferencia a coordinar'}>
            Podés ofertar desde hoy.
        </Block>
    );
}

function CalendarIcon() {
    return (
        <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-tenue)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
    );
}

function Block({
    icon,
    title,
    children,
    accent = false,
}: {
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
    accent?: boolean;
}) {
    return (
        <div className="flex items-center gap-3.5 rounded-[var(--radius-medio)] border border-[var(--color-borde)] bg-[var(--color-superficie)] px-5 py-4">
            {icon}
            <div className="flex flex-col gap-0.5">
                <span
                    className={
                        accent
                            ? 'font-mono text-[13px] tracking-[0.04em] text-[var(--color-acento)]'
                            : 'text-[16px] font-medium'
                    }
                >
                    {title}
                </span>
                <span className="text-[14px] text-[var(--color-tenue)]">{children}</span>
            </div>
        </div>
    );
}
