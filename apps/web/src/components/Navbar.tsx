import Link from 'next/link';
import { Logo } from './Logo';
import { NotificationBell } from './NotificationBell';
import { currentActor } from '@/lib/session';
import { logoutAction } from '@/app/actions';
import { UserRole } from '@marketplace/shared-types';

export async function Navbar() {
    const actor = await currentActor();
    const isAdmin = actor?.role === UserRole.ADMIN;

    return (
        <header className="border-b border-[var(--color-borde)]">
            <nav className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4 sm:px-12">
                <div className="flex items-center gap-11">
                    <Link href="/" className="flex items-center gap-2.5">
                        <Logo />
                        <span className="text-[17px] font-bold tracking-[-0.02em]">TRASPASO</span>
                    </Link>
                    <div className="hidden items-center gap-6 text-[13px] text-[var(--color-tenue)] md:flex">
                        <Link href="/listings" className="transition-colors hover:text-[var(--color-tinta)]">Mercado</Link>
                        <Link href="/#proceso" className="transition-colors hover:text-[var(--color-tinta)]">Cómo funciona</Link>
                        <Link href="/vender" className="transition-colors hover:text-[var(--color-tinta)]">Vender</Link>
                        {actor && (
                            <>
                                <Link href="/operaciones" className="transition-colors hover:text-[var(--color-tinta)]">Mis operaciones</Link>
                                <Link href="/denuncias" className="transition-colors hover:text-[var(--color-tinta)]">Reclamos</Link>
                            </>
                        )}
                        {isAdmin && (
                            <Link href="/admin" className="font-mono text-[11px] tracking-wider text-[var(--color-alerta)] transition-colors hover:text-[var(--color-tinta)]">
                                ADMIN
                            </Link>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <NotificationBell />
                    {actor ? (
                        <form action={logoutAction}>
                            <button
                                type="submit"
                                className="rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] px-4 py-2 text-[13px] text-[var(--color-tenue)] transition-colors hover:text-[var(--color-tinta)]"
                            >
                                Salir
                            </button>
                        </form>
                    ) : (
                        <Link
                            href="/registro"
                            className="hidden text-[13px] text-[var(--color-tenue)] transition-colors hover:text-[var(--color-tinta)] sm:block"
                        >
                            Crear cuenta
                        </Link>
                    )}
                    {!actor && (
                        <Link
                            href="/ingresar"
                            className="rounded-[var(--radius-chico)] bg-[var(--color-acento)] px-4 py-2 text-[13px] font-bold text-[var(--color-fondo)]"
                        >
                            Ingresar
                        </Link>
                    )}
                </div>
            </nav>
        </header>
    );
}
