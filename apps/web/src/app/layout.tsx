import type { Metadata } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { AvisoKyc } from '@/components/AvisoKyc';
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
        'El activo entra en custodia antes de que el comprador pague. Canales de YouTube, sitios web y cuentas sociales, con los datos sensibles protegidos por NDA.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="es" className={`${sans.variable} ${mono.variable}`}>
            <body className="flex min-h-screen flex-col">
                <Navbar />
                <AvisoKyc />
                <main className="flex-1">{children}</main>
                <Footer />
            </body>
        </html>
    );
}
