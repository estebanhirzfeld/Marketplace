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
 * Las plataformas de sitios más usadas en la Argentina, que asoman detrás del
 * mosaico del sitio. Cada una es un mosaico de su color de marca con el logo
 * en blanco, en el mismo idioma que el de YouTube. Tiendanube sale de su
 * propio sitio (logo y azul `#1D2340`); el resto son trazados de Simple Icons
 * (CC0), y de WooCommerce va el isotipo «Woo», porque la palabra completa no
 * se lee a este tamaño.
 */
const SITE_PLATFORMS = {
    tiendanube: { label: 'Tiendanube', color: '#1D2340', viewBox: '0 0 44 40', path: 'M24.0068 0H23.9915C23.9915 0 23.983 0 23.9779 0C20.4547 0.00509626 17.098 1.38958 14.5923 3.82559C13.3097 3.28199 11.9287 3 10.5017 3C4.71065 3 0 7.71065 0 13.5C0 19.2894 4.71065 24 10.5 24C11.9049 24 13.2945 23.7129 14.5804 23.1727C17.013 25.5391 20.3307 27 23.9847 27C31.4287 27 37.4847 20.9439 37.4847 13.5C37.4847 6.05606 31.4405 0.0118913 24.0068 0ZM23.9847 24C18.1954 24 13.4847 19.2894 13.4847 13.5H10.4847C10.4847 16.1484 11.2542 18.6183 12.5759 20.7044C11.9032 20.8981 11.205 21 10.5 21C6.36523 21 3 17.6348 3 13.5C3 9.36523 6.36523 6 10.5 6C12.1376 6 13.6937 6.51812 14.9983 7.4983C16.906 8.93035 18 11.1183 18 13.5H21C21 10.359 19.6393 7.45923 17.2491 5.4581C19.1263 3.88335 21.5062 3.0017 23.9915 3C29.7775 3.0034 34.483 7.71234 34.483 13.5C34.483 19.2877 29.7724 24 23.983 24H23.9847Z' },
    woocommerce: { label: 'WooCommerce', color: '#96588A', viewBox: '0 0 24 24', path: 'M2.227 4.857A2.228 2.228 0 000 7.094v7.457c0 1.236 1.001 2.237 2.237 2.237h9.253l4.229 2.355-.962-2.355h7.006c1.236 0 2.237-1 2.237-2.237V7.094c0-1.236-1-2.237-2.237-2.237zm8.08 1.311c.194.002.372.071.535.2a.769.769 0 01.304.56.851.851 0 01-.098.47c-.382.707-.696 1.894-.951 3.542-.246 1.6-.334 2.846-.275 3.739.02.245-.02.46-.118.647a.632.632 0 01-.52.353c-.255.02-.52-.098-.775-.362-.913-.933-1.639-2.326-2.169-4.18a184.085 184.085 0 00-1.413 2.825c-.578 1.11-1.069 1.678-1.481 1.708-.265.02-.49-.206-.687-.677-.5-1.286-1.04-3.768-1.619-7.448-.03-.255.02-.48.157-.657.137-.186.344-.284.618-.304.5-.04.785.196.854.706.304 2.051.638 3.788.991 5.21L5.809 8.41c.196-.373.441-.57.736-.589.431-.03.696.245.804.824.246 1.305.56 2.414.932 3.356.255-2.492.687-4.288 1.295-5.397.148-.274.363-.412.648-.431a.866.866 0 01.084-.004zm3.734 1.063c.167 0 .343.02.53.06.687.146 1.216.52 1.57 1.137.314.53.47 1.168.47 1.933 0 1.011-.254 1.933-.765 2.777-.588.981-1.354 1.472-2.305 1.472-.167 0-.344-.02-.53-.059-.697-.147-1.217-.52-1.57-1.138-.314-.54-.471-1.187-.471-1.943 0-1.01.255-1.933.765-2.767.599-.981 1.364-1.472 2.306-1.472zm6.152 0c.167 0 .343.02.53.06.696.146 1.216.52 1.57 1.137.314.53.47 1.168.47 1.933 0 1.011-.254 1.933-.765 2.777-.588.981-1.354 1.472-2.305 1.472-.167 0-.344-.02-.53-.059-.697-.147-1.217-.52-1.57-1.138-.314-.54-.471-1.187-.471-1.943 0-1.01.255-1.933.765-2.767.599-.981 1.364-1.472 2.306-1.472zm-6.107 1.645c-.307-.002-.606.201-.889.622a3.173 3.173 0 00-.52 1.168c-.05.225-.069.47-.069.716 0 .284.06.589.177.893.147.382.343.589.579.638.245.049.51-.06.795-.315.363-.323.608-.804.745-1.452.05-.225.069-.47.069-.726a2.49 2.49 0 00-.176-.893c-.148-.382-.344-.588-.58-.637a.714.714 0 00-.131-.014zm6.152 0c-.307-.002-.606.201-.889.622a3.173 3.173 0 00-.52 1.168c-.049.225-.069.47-.069.716 0 .284.06.589.177.893.147.382.344.589.579.638.245.049.51-.06.795-.315.363-.323.608-.804.745-1.452.04-.225.07-.47.07-.726a2.49 2.49 0 00-.177-.893c-.148-.382-.344-.588-.58-.637a.714.714 0 00-.131-.014Z' },
    wordpress: { label: 'WordPress', color: '#21759B', viewBox: '0 0 24 24', path: 'M21.469 6.825c.84 1.537 1.318 3.3 1.318 5.175 0 3.979-2.156 7.456-5.363 9.325l3.295-9.527c.615-1.54.82-2.771.82-3.864 0-.405-.026-.78-.07-1.11m-7.981.105c.647-.03 1.232-.105 1.232-.105.582-.075.514-.93-.067-.899 0 0-1.755.135-2.88.135-1.064 0-2.85-.15-2.85-.15-.585-.03-.661.855-.075.885 0 0 .54.061 1.125.09l1.68 4.605-2.37 7.08L5.354 6.9c.649-.03 1.234-.1 1.234-.1.585-.075.516-.93-.065-.896 0 0-1.746.138-2.874.138-.2 0-.438-.008-.69-.015C4.911 3.15 8.235 1.215 12 1.215c2.809 0 5.365 1.072 7.286 2.833-.046-.003-.091-.009-.141-.009-1.06 0-1.812.923-1.812 1.914 0 .89.513 1.643 1.06 2.531.411.72.89 1.643.89 2.977 0 .915-.354 1.994-.821 3.479l-1.075 3.585-3.9-11.61.001.014zM12 22.784c-1.059 0-2.081-.153-3.048-.437l3.237-9.406 3.315 9.087c.024.053.05.101.078.149-1.12.393-2.325.609-3.582.609M1.211 12c0-1.564.336-3.05.935-4.39L7.29 21.709C3.694 19.96 1.212 16.271 1.211 12M12 0C5.385 0 0 5.385 0 12s5.385 12 12 12 12-5.385 12-12S18.615 0 12 0' },
    shopify: { label: 'Shopify', color: '#7AB55C', viewBox: '0 0 24 24', path: 'M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.116-.114-.192-.211-.192s-1.929-.136-1.929-.136-1.275-1.274-1.439-1.411c-.045-.037-.075-.057-.121-.074l-.914 21.104h.023zM11.71 11.305s-.81-.424-1.774-.424c-1.447 0-1.504.906-1.504 1.141 0 1.232 3.24 1.715 3.24 4.629 0 2.295-1.44 3.76-3.406 3.76-2.354 0-3.54-1.465-3.54-1.465l.646-2.086s1.245 1.066 2.28 1.066c.675 0 .975-.545.975-.932 0-1.619-2.654-1.694-2.654-4.359-.034-2.237 1.571-4.416 4.827-4.416 1.257 0 1.875.361 1.875.361l-.945 2.715-.02.01zM11.17.83c.136 0 .271.038.405.135-.984.465-2.064 1.639-2.508 3.992-.656.213-1.293.405-1.889.578C7.697 3.75 8.951.84 11.17.84V.83zm1.235 2.949v.135c-.754.232-1.583.484-2.394.736.466-1.777 1.333-2.645 2.085-2.971.193.501.309 1.176.309 2.1zm.539-2.234c.694.074 1.141.867 1.429 1.755-.349.114-.735.231-1.158.366v-.252c0-.752-.096-1.371-.271-1.871v.002zm2.992 1.289c-.02 0-.06.021-.078.021s-.289.075-.714.21c-.423-1.233-1.176-2.37-2.508-2.37h-.115C12.135.209 11.669 0 11.265 0 8.159 0 6.675 3.877 6.21 5.846c-1.194.365-2.063.636-2.16.674-.675.213-.694.232-.772.87-.075.462-1.83 14.063-1.83 14.063L15.009 24l.927-21.166z' },
} as const;

type SitePlatform = keyof typeof SITE_PLATFORMS;

/**
 * Las dos capas que asoman detrás del frente. `offset` es la distancia del
 * borde exterior del mosaico al borde del lienzo; cada capa asoma 30 o 26 px
 * por fuera de la que tiene delante, y el logo va centrado en esa franja.
 */
const LAYERS = {
    middle: { width: 56, height: 44, offset: 26, icon: 20, iconInset: 5 },
    back: { width: 46, height: 36, offset: 0, icon: 16, iconInset: 5 },
} as const;

/** Fundido en los dos extremos de la composición, no en cada mosaico. */
const EDGE_FADE = 'linear-gradient(to right, rgba(0,0,0,0.2) 0%, black 16%, black 84%, rgba(0,0,0,0.2) 100%)';

/** El recorte del color de la tarjeta que separa cada mosaico del de atrás. */
const CUTOUT = '0 0 0 2px var(--color-superficie)';

function PlatformTile({
    platform,
    side,
    layer,
}: {
    platform: SitePlatform;
    side: 'left' | 'right';
    layer: keyof typeof LAYERS;
}) {
    const { color, viewBox, path } = SITE_PLATFORMS[platform];
    const { width, height, offset, icon, iconInset } = LAYERS[layer];

    return (
        <span
            className="absolute bottom-0 rounded-[11px]"
            style={{ [side]: offset, width, height, backgroundColor: color, boxShadow: CUTOUT }}
        >
            <svg
                className="absolute top-1/2 -translate-y-1/2"
                style={{ [side]: iconInset }}
                width={icon}
                height={icon}
                viewBox={viewBox}
                fill="#ffffff"
            >
                <path d={path} />
            </svg>
        </span>
    );
}

/**
 * El sitio web: un mosaico claro del tamaño del de YouTube con una ventana de
 * navegador, y las plataformas en que suele estar hecho asomando detrás.
 */
export function WebLogo() {
    return (
        <span
            role="img"
            aria-label="Sitio web: Tiendanube, WooCommerce, WordPress, Shopify u otro"
            className="relative block h-[52px] w-[184px] flex-none self-start"
            style={{ maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE }}
        >
            {/* De atrás hacia adelante: cada capa tapa a la anterior. */}
            <PlatformTile platform="wordpress" side="left" layer="back" />
            <PlatformTile platform="shopify" side="right" layer="back" />
            <PlatformTile platform="tiendanube" side="left" layer="middle" />
            <PlatformTile platform="woocommerce" side="right" layer="middle" />
            <svg
                className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-[13px]"
                style={{ boxShadow: CUTOUT }}
                width="72"
                height="52"
                viewBox="0 0 72 52"
            >
                <rect width="72" height="52" rx="13" fill="#e8e9ea" />
                <rect x="18" y="12" width="36" height="28" rx="5" fill="#141619" />
                <circle cx="23.5" cy="17.5" r="1.6" fill="#e8e9ea" />
                <circle cx="28.5" cy="17.5" r="1.6" fill="#e8e9ea" />
                <circle cx="33.5" cy="17.5" r="1.6" fill="#e8e9ea" />
                <rect x="22" y="24" width="28" height="12" rx="2" fill="#e8e9ea" opacity="0.18" />
            </svg>
        </span>
    );
}
