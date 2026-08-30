'use client';

import { useActionState } from 'react';
import { Alert, Button, Field } from './ui';

type State = { error?: string; ok?: boolean };

export function IdentityVerificationForm({
    action,
}: {
    action: (state: State, form: FormData) => Promise<State>;
}) {
    const [state, submit, pending] = useActionState(action, {});

    if (state.ok) {
        return (
            <div className="flex flex-col gap-4">
                <div className="rounded-[var(--radius-chico)] border border-[var(--color-acento)]/40 px-4 py-3 text-[14px] text-[var(--color-acento)]">
                    Identidad verificada. Ya podés publishListing activos y firmar.
                </div>
            </div>
        );
    }

    return (
        <form action={submit} className="flex flex-col gap-4">
            <Field
                label="Número de documento"
                name="dni"
                required
                placeholder="20123456"
                hint="Entre 7 y 11 dígitos. Se acepta con puntos."
            />
            <Field label="Teléfono (opcional)" name="phone" placeholder="+54 11 5555 0000" />
            <Field label="País (opcional)" name="country" maxLength={2} placeholder="AR" hint="Código de dos letras." />

            {state.error && <Alert>{state.error}</Alert>}

            <Button type="submit" disabled={pending} className="mt-1 w-full">
                {pending ? 'Verificando…' : 'Verificar mi identidad'}
            </Button>
        </form>
    );
}
