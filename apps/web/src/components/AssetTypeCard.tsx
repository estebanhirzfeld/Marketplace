import Link from 'next/link';

const CARD =
    'flex min-h-[260px] w-full flex-col items-stretch gap-5 rounded-[var(--radius-grande)] border border-[var(--color-borde-fuerte)] bg-[var(--color-superficie)] p-7 text-left text-[var(--color-tinta)] transition-colors hover:border-[var(--color-acento)] sm:min-h-[320px] sm:p-8';

/**
 * Una opción de `/vender`: el tipo de activo que se quiere publicar.
 *
 * Con `href` lleva a otra pantalla; con `action` envía una Server Action, para
 * el caso en que elegir ya es empezar (conectar YouTube abre Google).
 */
export function AssetTypeCard({
    logo,
    title,
    description,
    cta,
    href,
    action,
}: {
    logo: React.ReactNode;
    title: string;
    description: string;
    cta: string;
    href?: string;
    action?: () => Promise<void>;
}) {
    const content = (
        <>
            {logo}
            <span className="flex flex-col gap-2">
                <span className="text-[22px] font-bold sm:text-[26px]">{title}</span>
                <span className="text-[15px] leading-relaxed text-[var(--color-tenue)]">{description}</span>
            </span>
            <span className="mt-auto flex justify-end border-t border-[var(--color-borde)] pt-4 text-[15px] font-medium text-[var(--color-acento)]">
                {cta}
            </span>
        </>
    );

    if (action) {
        return (
            <form action={action}>
                <button type="submit" className={`${CARD} cursor-pointer`}>
                    {content}
                </button>
            </form>
        );
    }

    return (
        <Link href={href ?? '#'} className={CARD}>
            {content}
        </Link>
    );
}

/** El logo de YouTube, como en la marca: rectángulo rojo con el triángulo blanco. */
export function YouTubeLogo({ width = 72 }: { width?: number }) {
    return (
        <svg width={width} height={Math.round((width * 52) / 72)} viewBox="0 0 72 52" role="img" aria-label="YouTube">
            <rect width="72" height="52" rx="13" fill="#ff0000" />
            <path d="M29 15v22l19-11z" fill="#ffffff" />
        </svg>
    );
}

/** Un globo sobre fondo azul, para los sitios web. */
export function WebLogo() {
    return (
        <span
            aria-hidden="true"
            className="flex h-[52px] w-[72px] items-center justify-center rounded-[13px] bg-[#1f3a5f] text-[#8ec5ff]"
        >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
            </svg>
        </span>
    );
}
