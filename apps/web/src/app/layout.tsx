import type { Metadata } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { KycNotice } from '@/components/KycNotice';
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

export const metadata: Metadata = {
    title: 'Traspaso · Compraventa de activos digitales con custodia',
    description:
        'Comprá y vendé canales de YouTube y sitios web sin tener que confiar en un desconocido: recibimos el activo, lo revisamos, y recién ahí el comprador paga.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="es" className={`${sans.variable} ${mono.variable}`}>
            <body className="flex min-h-screen flex-col">
                <Navbar />
                <KycNotice />
                <main className="flex-1">{children}</main>
                <Footer />
            </body>
        </html>
    );
}
