import Link from 'next/link';
import { UserRole } from '@marketplace/shared-types';
import { currentProfile } from '@/lib/profile';
import { requireSession } from '@/lib/guards';
import { Reveal } from '@/components/Reveal';
import { ButtonLink, Panel, Heading, EmptyState } from '@/components/ui';
import { logoutAction } from '@/app/actions';
import { nombreDePais } from '@/components/paises';

export const metadata = { title: 'Mi perfil · Traspaso' };

const ROLES: Record<string, string> = {
    [UserRole.ADMIN]: 'Plataforma',
    [UserRole.SELLER]: 'Cuenta personal',
    [UserRole.BUYER]: 'Cuenta personal',
};

/**
 * La pantalla de la propia cuenta.
 *
 * No existía: el nombre, el correo y el estado de la verificación estaban en la
 * base y en la API, y no había ninguna dirección donde una persona pudiera
 * verlos. Es de solo lectura salvo la verificación de identidad, que tiene su
 * propia pantalla porque cambia lo que la cuenta puede hacer.
 */
export default async function Perfil() {
    const actor = await requireSession();
    const perfil = await currentProfile();

    if (!perfil) {
        return (
            <div className="mx-auto max-w-[900px] px-6 py-16 sm:px-12">
                <EmptyState
                    title="No pudimos cargar tu perfil"
                    text="El servidor no respondió. Probá recargar en un momento."
                />
            </div>
        );
    }

    const esPlataforma = actor.role === UserRole.ADMIN;

    return (
        <div className="mx-auto max-w-[900px] px-6 py-16 sm:px-12">
            <Reveal>
                <Heading sub="Los datos con los que operás en la plataforma.">Mi perfil</Heading>
            </Reveal>

            <div className="mt-10 flex flex-col gap-6">
                <Reveal>
                    <Panel title="TUS DATOS">
                        <dl className="flex flex-col">
                            <Dato etiqueta="Nombre" valor={perfil.fullName} />
                            <Dato etiqueta="Correo" valor={perfil.email} mono />
                            <Dato etiqueta="Tipo de cuenta" valor={ROLES[perfil.role] ?? 'Cuenta personal'} />
                            {perfil.dni && <Dato etiqueta="Documento" valor={perfil.dni} mono />}
                            {perfil.phone && <Dato etiqueta="Teléfono" valor={perfil.phone} mono />}
                            {perfil.country && (
                                <Dato etiqueta="País" valor={nombreDePais(perfil.country)} />
                            )}
                        </dl>
                    </Panel>
                </Reveal>

                <Reveal delay={80}>
                    <Panel title={perfil.isKycVerified ? 'IDENTIDAD VERIFICADA' : 'IDENTIDAD SIN VERIFICAR'}>
                        <div className="flex flex-col gap-4">
                            <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                {perfil.isKycVerified
                                    ? 'Podés publicar activos, firmar acuerdos de confidencialidad y cerrar contratos.'
                                    : 'Hasta que la verifiques no vas a poder publicar activos ni firmar nada. Es una sola vez.'}
                            </p>
                            {!perfil.isKycVerified && (
                                <ButtonLink href="/verificar" className="self-start">
                                    Verificar ahora
                                </ButtonLink>
                            )}
                        </div>
                    </Panel>
                </Reveal>

                {/* La plataforma no compra ni vende, así que no tiene nada que
                    mirar en las pantallas de la contraparte. */}
                {!esPlataforma && (
                    <Reveal delay={160}>
                        <Panel title="TU ACTIVIDAD">
                            <div className="flex flex-wrap gap-3">
                                <Atajo href="/vender" text="Mis activos" />
                                <Atajo href="/operaciones" text="Mis operaciones" />
                                <Atajo href="/denuncias" text="Mis reclamos" />
                                <Atajo href="/avisos" text="Mis avisos" />
                            </div>
                        </Panel>
                    </Reveal>
                )}

                <Reveal delay={240}>
                    <Panel title="SESIÓN">
                        <form action={logoutAction}>
                            <button
                                type="submit"
                                className="rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] px-4 py-2 text-[13px] text-[var(--color-tenue)] transition-colors hover:text-[var(--color-tinta)]"
                            >
                                Cerrar sesión
                            </button>
                        </form>
                    </Panel>
                </Reveal>
            </div>
        </div>
    );
}

function Dato({ etiqueta, valor, mono = false }: { etiqueta: string; valor: string; mono?: boolean }) {
    return (
        <div className="flex items-baseline justify-between gap-4 border-b border-[var(--color-borde)] py-3 last:border-0">
            <dt className="text-[13px] text-[var(--color-tenue)]">{etiqueta}</dt>
            <dd className={`text-[14px] ${mono ? 'font-mono' : ''}`}>{valor}</dd>
        </div>
    );
}

function Atajo({ href, text }: { href: string; text: string }) {
    return (
        <Link
            href={href}
            className="rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] px-4 py-2 text-[13px] text-[var(--color-tenue)] transition-colors hover:border-[var(--color-acento)] hover:text-[var(--color-tinta)]"
        >
            {text}
        </Link>
    );
}
