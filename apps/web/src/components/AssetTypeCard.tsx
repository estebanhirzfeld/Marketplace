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

/** El azul de la barra de la ventana: el color del sitio web en toda la marca. */
const WEB_COLOR = '#2f6bff';

/**
 * El logo del sitio web: una ventana de navegador blanca con la barra de
 * título de color y tres puntos, y dos renglones de contenido. Es la forma
 * misma del logo, a la medida de `YouTubeLogo`, y sirve a cualquier tamaño: en
 * las filas chicas (nivel de vendedor, bandeja del panel) pierde el detalle de
 * los renglones y queda la ventana.
 */
export function WebMark({
    width = 72,
    decorative = false,
}: {
    width?: number;
    /** Dentro de una composición que ya se nombra a sí misma. */
    decorative?: boolean;
}) {
    return (
        <svg
            width={width}
            height={Math.round((width * 52) / 72)}
            viewBox="0 0 72 52"
            {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': 'Sitio web' })}
        >
            <rect x="1.5" y="1.5" width="69" height="49" rx="11" fill="#ffffff" />
            <path d="M1.5 12.5a11 11 0 0 1 11-11h47a11 11 0 0 1 11 11v4h-69z" fill={WEB_COLOR} />
            <circle cx="10" cy="9" r="2.2" fill="#ffffff" />
            <circle cx="17" cy="9" r="2.2" fill="#ffffff" />
            <circle cx="24" cy="9" r="2.2" fill="#ffffff" />
            <rect x="10" y="25" width="30" height="5" rx="2.5" fill={WEB_COLOR} />
            <rect x="10" y="35" width="44" height="4" rx="2" fill="#c9d3e6" />
        </svg>
    );
}

/** El sitio web en `/vender`, del mismo tamaño que el logo de YouTube. */
export function WebLogo({ width = 72 }: { width?: number }) {
    return <WebMark width={width} />;
}

/**
 * La marca del tipo de activo, chica. Todo lugar que dibuje un logo según el
 * activo pasa por acá, así ninguno queda con el de YouTube fijo. Un tipo que
 * no se conoce no dibuja nada antes que dibujar el de otro.
 */
export function AssetMark({ assetType, width = 22 }: { assetType: string; width?: number }) {
    if (assetType === 'youtube') return <YouTubeLogo width={width} />;
    if (assetType === 'web') return <WebMark width={width} />;
    return null;
}
