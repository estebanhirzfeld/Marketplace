'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Alert, Button, Field } from './ui';

type State = { error?: string };

/**
 * Componente cliente porque necesita el estado pendiente del envío. La acción
 * que recibe corre en el servidor: la contraseña nunca se guarda en el cliente.
 */
export function AuthForm({
    action,
    title,
    bajada,
    conNombre = false,
    textoBoton,
    pie,
}: {
    action: (state: State, form: FormData) => Promise<State>;
    title: string;
    bajada: string;
    conNombre?: boolean;
    textoBoton: string;
    pie: { text: string; enlace: string; href: string };
}) {
    const [state, submit, pending] = useActionState(action, {});

    return (
        <div className="mx-auto flex w-full max-w-[420px] flex-col gap-7 px-6 py-20">
            <div className="flex flex-col gap-2">
                <h1 className="text-[30px] font-bold tracking-[-0.03em]">{title}</h1>
                <p className="text-[15px] leading-relaxed text-[var(--color-tenue)]">{bajada}</p>
            </div>

            <form action={submit} className="flex flex-col gap-4">
                {conNombre && (
                    <Field label="Nombre completo" name="fullName" required autoComplete="name" />
                )}
                <Field label="Email" name="email" type="email" required autoComplete="email" />
                <Field
                    label="Contraseña"
                    name="password"
                    type="password"
                    required
                    autoComplete={conNombre ? 'new-password' : 'current-password'}
                    hint={conNombre ? 'Mínimo 8 caracteres, con al menos una letra y un número.' : undefined}
                />

                {state.error && <Alert>{state.error}</Alert>}

                <Button type="submit" disabled={pending} className="mt-1 w-full">
                    {pending ? 'Un momento…' : textoBoton}
                </Button>
            </form>

            <p className="text-center text-[14px] text-[var(--color-tenue)]">
                {pie.text}{' '}
                <Link href={pie.href} className="text-[var(--color-acento)]">
                    {pie.enlace}
                </Link>
            </p>
        </div>
    );
}
