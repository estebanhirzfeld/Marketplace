import { ChannelAvatar } from './ChannelAvatar';
import { CheckIcon } from './ui';

/**
 * La tarjeta del activo en las verificaciones cuando no hay un canal leído de
 * Google: la marca (o la inicial), el nombre, de qué se trata y, si la hay, la
 * nota de lo que sostiene la valuación.
 *
 * Aloja también lo que falta para que el activo sea del vendedor: la acción
 * va dentro de la tarjeta, junto al nombre, en vez de en otra tarjeta aparte.
 *
 * Con contenido ocupa el alto de su vecina (el nivel). Sin él se alinea arriba
 * y mide lo que mide su contenido: centrarlo dejaba un hueco grande encima y
 * debajo.
 */
export function AssetSummaryCard({
    name,
    subtitle,
    note,
    mark,
    children,
}: {
    name: string;
    /** De qué se trata: el tipo de activo, o el dominio y el rubro. */
    subtitle: string;
    note?: React.ReactNode;
    /** El logo del tipo de activo. Sin él, la inicial del nombre. */
    mark?: React.ReactNode;
    children?: React.ReactNode;
}) {
    return (
        <div
            className={`flex flex-col gap-5 rounded-[var(--radius-grande)] border border-[var(--color-borde)] bg-[var(--color-superficie)] p-6 ${
                children ? '' : 'self-start'
            }`}
        >
            <div className="flex items-start gap-4">
                {mark ?? <ChannelAvatar name={name} shape="square" />}
                <div className="flex min-w-0 flex-col gap-0.5 self-center">
                    <span className="truncate text-[20px] font-bold">{name}</span>
                    <span className="truncate text-[13px] text-[var(--color-tenue)]">{subtitle}</span>
                    {note && <span className="mt-1 text-[13px] leading-relaxed text-[var(--color-apagado)]">{note}</span>}
                </div>
            </div>
            {children}
        </div>
    );
}

/**
 * Lo que falta comprobar de un sitio: que es del vendedor. La acción principal
 * abre el diálogo de DNS; `alternative` es la salida de quien no puede cargar
 * el registro y solo se dibuja si existe.
 */
export function OwnershipCheck({ action, alternative }: { action: React.ReactNode; alternative?: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-3.5 rounded-[var(--radius-grande)] border border-[var(--color-borde-fuerte)] bg-[var(--color-fondo)]/60 p-5">
            <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[18px] font-bold">Comprobá que el sitio es tuyo</h3>
                <span className="font-mono text-[12px] text-[var(--color-acento)]">+1 NIVEL</span>
            </div>
            <p className="text-[14px] leading-relaxed text-[#c4c8cd]">
                Agregás un registro en el DNS de tu dominio y lo detectamos solo, en minutos. Publicás sin revisión y
                tus números llevan sello.
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {action}
                {alternative}
            </div>
        </div>
    );
}

/** La constancia de que el sitio ya es del vendedor, en lugar del bloque que lo pide. */
export function OwnershipProof({ sourceLabel }: { sourceLabel: string }) {
    return (
        <div className="flex items-center gap-2.5 text-[14px] text-[var(--color-tenue)]">
            <CheckIcon />
            <span>Titularidad comprobada con {sourceLabel}</span>
        </div>
    );
}
