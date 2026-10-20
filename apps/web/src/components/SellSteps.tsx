/**
 * Los pasos de publicar, con el actual resaltado. Es solo orientación: no
 * navega, porque cada paso es una pantalla que el servidor decide.
 */
export function SellSteps({ labels, current }: { labels: readonly string[]; current: number }) {
    return (
        <ol
            aria-label="Pasos"
            className="m-0 grid list-none gap-3 p-0"
            style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}
        >
            {labels.map((label, i) => {
                const active = i === current;
                return (
                    <li key={label} aria-current={active ? 'step' : undefined} className="flex flex-col gap-2.5">
                        <span
                            className={`h-1 rounded-sm ${active ? 'bg-[var(--color-acento)]' : 'bg-[var(--color-borde-fuerte)]'}`}
                        />
                        <span
                            className={`font-mono text-[12px] ${active ? 'text-[var(--color-acento)]' : 'text-[var(--color-apagado)]'}`}
                        >
                            {label}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}
