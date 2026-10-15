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

/**
 * Las plataformas de sitios que asoman detrás del globo. Trazados de Simple
 * Icons (CC0), con el color de cada marca.
 */
const SITE_PLATFORMS = {
    blogger: { label: 'Blogger', color: '#FF5722', path: 'M21.976 24H2.026C.9 24 0 23.1 0 21.976V2.026C0 .9.9 0 2.025 0H22.05C23.1 0 24 .9 24 2.025v19.95C24 23.1 23.1 24 21.976 24zM12 3.975H9c-2.775 0-5.025 2.25-5.025 5.025v6c0 2.774 2.25 5.024 5.025 5.024h6c2.774 0 5.024-2.25 5.024-5.024v-3.975c0-.6-.45-1.05-1.05-1.05H18c-.524 0-.976-.45-.976-.976 0-2.776-2.25-5.026-5.024-5.026zm3.074 12H9c-.525 0-.975-.45-.975-.975s.45-.976.975-.976h6.074c.526 0 .977.45.977.976s-.45.976-.975.976zm-2.55-7.95c.527 0 .976.45.976.975s-.45.975-.975.975h-3.6c-.525 0-.976-.45-.976-.975s.45-.975.975-.975h3.6z' },
    wordpress: { label: 'WordPress', color: '#21759B', path: 'M21.469 6.825c.84 1.537 1.318 3.3 1.318 5.175 0 3.979-2.156 7.456-5.363 9.325l3.295-9.527c.615-1.54.82-2.771.82-3.864 0-.405-.026-.78-.07-1.11m-7.981.105c.647-.03 1.232-.105 1.232-.105.582-.075.514-.93-.067-.899 0 0-1.755.135-2.88.135-1.064 0-2.85-.15-2.85-.15-.585-.03-.661.855-.075.885 0 0 .54.061 1.125.09l1.68 4.605-2.37 7.08L5.354 6.9c.649-.03 1.234-.1 1.234-.1.585-.075.516-.93-.065-.896 0 0-1.746.138-2.874.138-.2 0-.438-.008-.69-.015C4.911 3.15 8.235 1.215 12 1.215c2.809 0 5.365 1.072 7.286 2.833-.046-.003-.091-.009-.141-.009-1.06 0-1.812.923-1.812 1.914 0 .89.513 1.643 1.06 2.531.411.72.89 1.643.89 2.977 0 .915-.354 1.994-.821 3.479l-1.075 3.585-3.9-11.61.001.014zM12 22.784c-1.059 0-2.081-.153-3.048-.437l3.237-9.406 3.315 9.087c.024.053.05.101.078.149-1.12.393-2.325.609-3.582.609M1.211 12c0-1.564.336-3.05.935-4.39L7.29 21.709C3.694 19.96 1.212 16.271 1.211 12M12 0C5.385 0 0 5.385 0 12s5.385 12 12 12 12-5.385 12-12S18.615 0 12 0' },
    shopify: { label: 'Shopify', color: '#7AB55C', path: 'M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.116-.114-.192-.211-.192s-1.929-.136-1.929-.136-1.275-1.274-1.439-1.411c-.045-.037-.075-.057-.121-.074l-.914 21.104h.023zM11.71 11.305s-.81-.424-1.774-.424c-1.447 0-1.504.906-1.504 1.141 0 1.232 3.24 1.715 3.24 4.629 0 2.295-1.44 3.76-3.406 3.76-2.354 0-3.54-1.465-3.54-1.465l.646-2.086s1.245 1.066 2.28 1.066c.675 0 .975-.545.975-.932 0-1.619-2.654-1.694-2.654-4.359-.034-2.237 1.571-4.416 4.827-4.416 1.257 0 1.875.361 1.875.361l-.945 2.715-.02.01zM11.17.83c.136 0 .271.038.405.135-.984.465-2.064 1.639-2.508 3.992-.656.213-1.293.405-1.889.578C7.697 3.75 8.951.84 11.17.84V.83zm1.235 2.949v.135c-.754.232-1.583.484-2.394.736.466-1.777 1.333-2.645 2.085-2.971.193.501.309 1.176.309 2.1zm.539-2.234c.694.074 1.141.867 1.429 1.755-.349.114-.735.231-1.158.366v-.252c0-.752-.096-1.371-.271-1.871v.002zm2.992 1.289c-.02 0-.06.021-.078.021s-.289.075-.714.21c-.423-1.233-1.176-2.37-2.508-2.37h-.115C12.135.209 11.669 0 11.265 0 8.159 0 6.675 3.877 6.21 5.846c-1.194.365-2.063.636-2.16.674-.675.213-.694.232-.772.87-.075.462-1.83 14.063-1.83 14.063L15.009 24l.927-21.166z' },
    wix: { label: 'Wix', color: '#0C6EFC', path: 'm0 7.354 2.113 9.292h.801a1.54 1.54 0 0 0 1.506-1.218l1.351-6.34a.171.171 0 0 1 .167-.137c.08 0 .15.058.167.137l1.352 6.34a1.54 1.54 0 0 0 1.506 1.218h.805l2.113-9.292h-.565c-.62 0-1.159.43-1.296 1.035l-1.26 5.545-1.106-5.176a1.76 1.76 0 0 0-2.19-1.324c-.639.176-1.113.716-1.251 1.365l-1.094 5.127-1.26-5.537A1.33 1.33 0 0 0 .563 7.354H0zm13.992 0a.951.951 0 0 0-.951.95v8.342h.635a.952.952 0 0 0 .951-.95V7.353h-.635zm1.778 0 3.158 4.66-3.14 4.632h1.325c.368 0 .712-.181.918-.486l1.756-2.59a.12.12 0 0 1 .197 0l1.754 2.59c.206.305.55.486.918.486h1.326l-3.14-4.632L24 7.354h-1.326c-.368 0-.712.181-.918.486l-1.772 2.617a.12.12 0 0 1-.197 0L18.014 7.84a1.108 1.108 0 0 0-.918-.486H15.77z' },
} as const;

type SitePlatform = keyof typeof SITE_PLATFORMS;

/**
 * Medidas de cada capa, en píxeles. El globo ocupa el centro de un lienzo de
 * 220 de ancho; cada plataforma asoma ~35 px por fuera de la capa que tiene
 * delante, y el logo va centrado en esa franja visible.
 */
const LAYERS = {
    near: { width: 58, height: 46, offset: 36, icon: 20, iconInset: 9, opacity: 0.9, fadeEnd: 30 },
    far: { width: 50, height: 36, offset: 6, icon: 15, iconInset: 8, opacity: 0.55, fadeEnd: 45 },
} as const;

/**
 * Una plataforma detrás del globo. Se ve solo la parte que asoma, con un
 * fundido leve hacia el borde exterior.
 */
function PlatformTile({
    platform,
    side,
    depth,
}: {
    platform: SitePlatform;
    side: 'left' | 'right';
    depth: keyof typeof LAYERS;
}) {
    const { color, path } = SITE_PLATFORMS[platform];
    const layer = LAYERS[depth];
    const fade = `linear-gradient(to ${side === 'left' ? 'right' : 'left'}, rgba(0,0,0,0.25) 0%, black ${layer.fadeEnd}%)`;

    return (
        <span
            className="absolute bottom-0 rounded-[11px]"
            style={{
                [side]: layer.offset,
                width: layer.width,
                height: layer.height,
                backgroundColor: color,
                opacity: layer.opacity,
                maskImage: fade,
                WebkitMaskImage: fade,
            }}
        >
            <svg
                className="absolute top-1/2 -translate-y-1/2"
                style={{ [side]: layer.iconInset }}
                width={layer.icon}
                height={layer.icon}
                viewBox="0 0 24 24"
                fill="#ffffff"
            >
                <path d={path} />
            </svg>
        </span>
    );
}

/**
 * Un globo sobre fondo azul, para los sitios web, con WordPress, Shopify,
 * Blogger y Wix asomando por los costados: un sitio puede estar hecho en
 * cualquiera de ellos, o en ninguno.
 */
export function WebLogo() {
    return (
        <span
            role="img"
            aria-label="Sitio web: WordPress, Shopify, Blogger, Wix u otro"
            className="relative block h-[58px] w-[220px] flex-none self-start"
        >
            {/* De atrás hacia adelante: cada capa tapa a la anterior. */}
            <PlatformTile platform="blogger" side="left" depth="far" />
            <PlatformTile platform="wix" side="right" depth="far" />
            <PlatformTile platform="wordpress" side="left" depth="near" />
            <PlatformTile platform="shopify" side="right" depth="near" />
            <span className="absolute bottom-0 left-1/2 flex h-[58px] w-[72px] -translate-x-1/2 items-center justify-center rounded-[13px] bg-[#1f3a5f] text-[#8ec5ff] shadow-[0_0_0_3px_var(--color-superficie)]">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
                </svg>
            </span>
        </span>
    );
}
