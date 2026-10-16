import type { Metadata } from 'next';
import { robotsMetadata } from '@/lib/indexing';

export const SITE_NAME = 'Traspaso';

const TITLE = 'Traspaso · Compraventa de activos digitales con custodia';
const DESCRIPTION =
    'Canales de YouTube y sitios web. Recibimos el activo, lo revisamos, y recién ahí el comprador paga.';

/** Dirección pública de producción: lo que se usa cuando la variable no llega. */
const DEFAULT_SITE_URL = 'https://traspaso.forzalabs.online';

/**
 * Base para armar direcciones absolutas (imagen para compartir, íconos).
 *
 * El release se compila en CI, donde `NEXT_PUBLIC_APP_URL` no existe, y Next
 * puede dejar esa lectura resuelta en el build (ver `publicBaseUrl` en
 * `mercadopagoLink.ts`). Por eso el valor de reserva es el dominio real: una
 * variable ausente, en blanco o que no es una URL nunca rompe el render ni
 * manda la vista previa a localhost.
 */
export function siteBaseUrl(envUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL): URL {
    const configured = envUrl?.trim();
    if (configured) {
        try {
            return new URL(configured);
        } catch {
            // Cae al dominio público.
        }
    }
    return new URL(DEFAULT_SITE_URL);
}

/**
 * Metadatos de la portada y base de todas las páginas.
 *
 * `robots` sigue a `SEARCH_INDEXING` y es independiente de la vista previa: un
 * enlace compartido en WhatsApp se ve igual con el indexado apagado. La imagen
 * (`og:image` y `twitter:image`) la agregan `opengraph-image.tsx` y
 * `twitter-image.tsx` por convención de archivos.
 */
export function siteMetadata(envUrl?: string): Metadata {
    return {
        metadataBase: siteBaseUrl(envUrl),
        title: TITLE,
        description: DESCRIPTION,
        applicationName: SITE_NAME,
        keywords: [
            'compraventa de canales de YouTube',
            'comprar sitio web',
            'vender sitio web',
            'activos digitales',
            'custodia',
            'Traspaso',
        ],
        robots: robotsMetadata(),
        openGraph: {
            type: 'website',
            locale: 'es_AR',
            url: '/',
            siteName: SITE_NAME,
            title: TITLE,
            description: DESCRIPTION,
        },
        twitter: {
            card: 'summary_large_image',
            title: TITLE,
            description: DESCRIPTION,
        },
        icons: {
            icon: [{ url: '/brand/traspaso-icono-app-512.png', sizes: '512x512', type: 'image/png' }],
            apple: [{ url: '/brand/traspaso-icono-app-120.png', sizes: '120x120', type: 'image/png' }],
        },
    };
}
