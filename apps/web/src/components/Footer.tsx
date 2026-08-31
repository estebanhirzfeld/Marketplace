import Link from 'next/link';
import { UserRole } from '@marketplace/shared-types';
import { currentActor } from '@/lib/session';
import { Logo } from './Logo';

const COLUMNAS = [
    { title: 'MERCADO', enlaces: [['Explorar', '/listings'], ['Publicar', '/vender'], ['Mis activos', '/activos']] },
    { title: 'PROCESO', enlaces: [['Custodia', '/#proceso'], ['Confidencialidad', '/#proceso'], ['Comisiones', '/#comision']] },
    { title: 'LEGAL', enlaces: [['Términos', '/'], ['Privacidad', '/'], ['Contacto', '/']] },
] as const;

/*
 * La plataforma no compra ni vende, así que tampoco le corresponde el
 * enlace a publicar. El navbar ya lo escondía y el pie no, con lo cual el
 * admin hacía click y rebotaba contra la guarda de /vender.
 */
export async function Footer() {
    const actor = await currentActor();
    const isAdmin = actor?.role === UserRole.ADMIN;

    return (
        <footer className="mt-auto border-t border-[var(--color-borde)]">
            <div className="mx-auto flex max-w-[1400px] flex-col gap-10 px-6 py-10 sm:px-12 md:flex-row md:items-start md:justify-between">
                <div className="flex max-w-[300px] flex-col gap-3">
                    <div className="flex items-center gap-2.5">
                        <Logo tamano={16} />
                        <span className="font-mono text-[11px] tracking-wider text-[var(--color-apagado)]">
                            TRASPASO
                        </span>
                    </div>
                    <p className="text-[13px] leading-relaxed text-[var(--color-apagado)]">
                        Intermediación con custodia para la compraventa de activos digitales.
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 sm:gap-14">
                    {COLUMNAS.map((col) => (
                        <div key={col.title} className="flex flex-col gap-2.5">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-tenue)]">
                                {col.title}
                            </div>
                            {col.enlaces
                                .filter(([, href]) => !(isAdmin && href === '/vender'))
                                .map(([text, href]) => (
                                    <Link
                                        key={text}
                                        href={href}
                                        className="text-[13px] text-[var(--color-tenue)] transition-colors hover:text-[var(--color-tinta)]"
                                    >
                                        {text}
                                    </Link>
                                ))}
                        </div>
                    ))}
                </div>
            </div>
        </footer>
    );
}
