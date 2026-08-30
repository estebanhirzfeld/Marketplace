'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Aviso, Boton, Campo } from './ui';

type Estado = { error?: string };

/**
 * Componente cliente porque necesita el estado pendiente del envío. La acción
 * que recibe corre en el servidor: la contraseña nunca se guarda en el cliente.
 */
export function FormularioAuth({
    accion,
    titulo,
    bajada,
    conNombre = false,
    textoBoton,
    pie,
}: {
    accion: (estado: Estado, datos: FormData) => Promise<Estado>;
    titulo: string;
    bajada: string;
    conNombre?: boolean;
    textoBoton: string;
    pie: { texto: string; enlace: string; href: string };
}) {
    const [estado, enviar, pendiente] = useActionState(accion, {});

    return (
        <div className="mx-auto flex w-full max-w-[420px] flex-col gap-7 px-6 py-20">
            <div className="flex flex-col gap-2">
                <h1 className="text-[30px] font-bold tracking-[-0.03em]">{titulo}</h1>
                <p className="text-[15px] leading-relaxed text-[var(--color-tenue)]">{bajada}</p>
            </div>

            <form action={enviar} className="flex flex-col gap-4">
                {conNombre && (
                    <Campo etiqueta="Nombre completo" name="fullName" required autoComplete="name" />
                )}
                <Campo etiqueta="Email" name="email" type="email" required autoComplete="email" />
                <Campo
                    etiqueta="Contraseña"
                    name="password"
                    type="password"
                    required
                    autoComplete={conNombre ? 'new-password' : 'current-password'}
                    ayuda={conNombre ? 'Mínimo 8 caracteres, con al menos una letra y un número.' : undefined}
                />

                {estado.error && <Aviso>{estado.error}</Aviso>}

                <Boton type="submit" disabled={pendiente} className="mt-1 w-full">
                    {pendiente ? 'Un momento…' : textoBoton}
                </Boton>
            </form>

            <p className="text-center text-[14px] text-[var(--color-tenue)]">
                {pie.texto}{' '}
                <Link href={pie.href} className="text-[var(--color-acento)]">
                    {pie.enlace}
                </Link>
            </p>
        </div>
    );
}
