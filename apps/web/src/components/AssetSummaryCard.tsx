import { ChannelAvatar } from './ChannelAvatar';

/**
 * La tarjeta del activo en las verificaciones cuando no hay un canal leído de
 * Google: la inicial, el nombre, de qué tipo es y la nota de lo que sostiene la
 * valuación.
 *
 * Se alinea arriba: la tarjeta vecina (el nivel) es más alta, y centrar el
 * contenido dejaba un hueco grande encima y debajo. Con `self-start` la tarjeta
 * mide lo que mide su contenido.
 */
export function AssetSummaryCard({
    name,
    assetLabel,
    note,
}: {
    name: string;
    /** El tipo de activo, como lo nombra su descriptor. */
    assetLabel: string;
    note: React.ReactNode;
}) {
    return (
        <div className="flex items-start gap-4 self-start rounded-[var(--radius-grande)] border border-[var(--color-borde)] bg-[var(--color-superficie)] p-6">
            <ChannelAvatar name={name} shape="square" />
            <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[20px] font-bold">{name}</span>
                <span className="text-[13px] text-[var(--color-apagado)]">{assetLabel}</span>
                <span className="mt-1 text-[13px] leading-relaxed text-[var(--color-apagado)]">{note}</span>
            </div>
        </div>
    );
}
