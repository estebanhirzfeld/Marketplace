'use client';

import { useActionState } from 'react';
import { Alert, Button } from './ui';

type State = { error?: string; ok?: boolean; message?: string };
type Variant = 'primario' | 'secundario' | 'peligro';

/**
 * Botón que dispara un paso de la operación y cuenta cómo salió.
 *
 * Cuando el paso confirma con un mensaje, el botón se retira y queda la
 * confirmación: apretar dos veces "Firmar el contrato" devolvía un error del
 * dominio, que era la única forma de enterarse de que la primera firma había
 * quedado registrada.
 */
export function OperationAction({
    action,
    text,
    variant = 'primario',
    note,
}: {
    action: (state: State) => Promise<State>;
    text: string;
    variant?: Variant;
    note?: string;
}) {
    const [state, submit, pending] = useActionState(action, {});

    if (state.ok && state.message) {
        return <Alert tono="listo">{state.message}</Alert>;
    }

    return (
        <div className="flex flex-col gap-2.5">
            {state.error && <Alert>{state.error}</Alert>}
            <form action={submit}>
                <Button type="submit" variant={variant} disabled={pending} className="w-full">
                    {pending ? 'Un momento…' : text}
                </Button>
            </form>
            {note && <p className="text-[12px] leading-relaxed text-[var(--color-apagado)]">{note}</p>}
        </div>
    );
}
