import Link from 'next/link';
import { Logo } from './Logo';
import { NotificationBell } from './NotificationBell';
import { currentActor } from '@/lib/session';
import { currentProfile } from '@/lib/profile';
import { logoutAction } from '@/app/actions';
import { UserRole } from '@marketplace/shared-types';

export async function Navbar() {
    const actor = await currentActor();
    const isAdmin = actor?.role === UserRole.ADMIN;
    // El nombre no viaja en la sesión: la cookie guarda el actor, que es id y
    // rol. `currentProfile` está memoizado por request, así que esto no agrega
    // una llamada — la comparte con el aviso de verificación del layout.
    const profile = await currentProfile();

    /*
     * Un solo lugar donde se decide qué ve cada rol, para que el menú de
     * escritorio y el de teléfono no puedan discrepar.
     *
     * La plataforma no compra ni vende, así que nada de eso le corresponde:
     * ni vender, ni tener operaciones propias, ni reclamos, que solo puede
     * abrirlos una de las partes.
     */
    // Lo que ve cualquiera, con sesión o sin ella.
    const enlaces: { href: string; text: string; destacado?: boolean }[] = [
        { href: '/listings', text: 'Mercado' },
        { href: '/#proceso', text: 'Cómo funciona' },
    ];

    /*
     * Lo propio de cada uno solo aparece con sesión.
     *
     * "Mis activos" se mostraba también a un visitante anónimo, que al entrar
     * caía en la pantalla de ingreso: un enlace que promete algo tuyo cuando
     * todavía no sos nadie. Las tres secciones son lo mismo —lo que te
     * pertenece— así que se agrupan bajo la misma condición y no puede volver
     * a quedar una suelta.
     */
    if (actor && !isAdmin) {
        enlaces.push(
            { href: '/activos', text: 'Mis activos' },
            { href: '/operaciones', text: 'Mis compras' },
            { href: '/denuncias', text: 'Reclamos' },
        );
    }

    if (isAdmin) {
        enlaces.push(
            { href: '/admin/cuentas', text: 'Cuentas' },
            { href: '/admin', text: 'ADMIN', destacado: true },
        );
    }

    return (
        <header className="border-b border-[var(--color-borde)]">
            <nav className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4 sm:px-12">
                <div className="flex items-center gap-11">
                    <Link href="/" className="flex items-center gap-2.5">
                        <Logo />
                        <span className="text-[17px] font-bold tracking-[-0.02em]">TRASPASO</span>
                    </Link>
                    <div className="hidden items-center gap-6 text-[14px] text-[var(--color-tenue)] md:flex">
                        {enlaces.map((e) => (
                            <Link
                                key={e.href}
                                href={e.href}
                                className={
                                    e.destacado
                                        ? 'font-mono text-[12px] tracking-wider text-[var(--color-alerta)] transition-colors hover:text-[var(--color-tinta)]'
                                        : 'transition-colors hover:text-[var(--color-tinta)]'
                                }
                            >
                                {e.text}
                            </Link>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {profile && (
                        <Link
                            href="/perfil"
                            className="hidden max-w-[190px] truncate text-[13px] text-[var(--color-tinta)] transition-colors hover:text-[var(--color-acento)] sm:block"
                            title={profile.fullName}
                        >
                            {profile.fullName}
                        </Link>
                    )}
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

                    {/*
                        El menú de teléfono. Hasta acá la navegación entera vivía
                        detrás de `hidden md:flex` sin ningún reemplazo, así que
                        desde un celular no se podía llegar a Mercado, Vender, Mis
                        operaciones, Reclamos ni Admin: quedaban la campana y el
                        botón de salir.

                        Va con `<details>` y no con estado de React para que el
                        navbar siga siendo un componente de servidor: abrir un
                        menú no justifica mandar JavaScript al navegador.
                    */}
                    <details className="relative md:hidden">
                        <summary
                            className="flex size-9 cursor-pointer list-none items-center justify-center rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] [&::-webkit-details-marker]:hidden"
                            aria-label="Abrir el menú"
                        >
                            <span aria-hidden className="flex flex-col gap-[3px]">
                                <span className="block h-px w-4 bg-[var(--color-tenue)]" />
                                <span className="block h-px w-4 bg-[var(--color-tenue)]" />
                                <span className="block h-px w-4 bg-[var(--color-tenue)]" />
                            </span>
                        </summary>
                        <div className="absolute right-0 top-11 z-20 flex w-56 flex-col rounded-[var(--radius-medio)] border border-[var(--color-borde-fuerte)] bg-[var(--color-superficie)] p-2 shadow-lg">
                            {enlaces.map((e) => (
                                <Link
                                    key={e.href}
                                    href={e.href}
                                    className={`rounded-[var(--radius-chico)] px-3 py-2.5 text-[14px] transition-colors hover:bg-[var(--color-superficie-alta)] ${
                                        e.destacado
                                            ? 'font-mono text-[12px] tracking-wider text-[var(--color-alerta)]'
                                            : 'text-[var(--color-tinta)]'
                                    }`}
                                >
                                    {e.text}
                                </Link>
                            ))}
                            {profile && (
                                <Link
                                    href="/perfil"
                                    className="truncate rounded-[var(--radius-chico)] px-3 py-2.5 text-[14px] text-[var(--color-tenue)] transition-colors hover:bg-[var(--color-superficie-alta)]"
                                >
                                    {profile.fullName}
                                </Link>
                            )}
                            {!actor && (
                                <Link
                                    href="/registro"
                                    className="rounded-[var(--radius-chico)] px-3 py-2.5 text-[14px] text-[var(--color-tenue)] transition-colors hover:bg-[var(--color-superficie-alta)]"
                                >
                                    Crear cuenta
                                </Link>
                            )}
                        </div>
                    </details>
                </div>
            </nav>
        </header>
    );
}
