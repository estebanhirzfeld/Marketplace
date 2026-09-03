import type { Metadata } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { KycNotice } from '@/components/KycNotice';
import { DemoBanner } from '@/components/DemoBanner';
import { robotsMetadata } from '@/lib/indexing';
import './globals.css';

const sans = Space_Grotesk({
    subsets: ['latin'],
    weight: ['400', '500', '700'],
    variable: '--fuente-sans',
    display: 'swap',
});

const mono = JetBrains_Mono({
    subsets: ['latin'],
    weight: ['400', '500', '700'],
    variable: '--fuente-mono',
    display: 'swap',
});

// `generateMetadata` en vez de un objeto estático para que la directiva
// `robots` siga a `SEARCH_INDEXING`: cambiar la variable y reiniciar el
// servicio alcanza, sin recompilar. El artefacto autoritativo del interruptor
// es `app/robots.ts` (dinámico); esta etiqueta es una segunda capa.
export function generateMetadata(): Metadata {
    return {
        title: 'Traspaso · Compraventa de activos digitales con custodia',
        description:
            'Canales de YouTube y sitios web. Recibimos el activo, lo revisamos, y recién ahí el comprador paga.',
        robots: robotsMetadata(),
    };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="es" className={`${sans.variable} ${mono.variable}`}>
            <body className="flex min-h-screen flex-col">
                <DemoBanner />
                <Navbar />
                <KycNotice />
                <main className="flex-1">{children}</main>
                <Footer />
            </body>
        </html>
    );
}
