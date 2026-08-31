'use client';

import { useActionState } from 'react';
import { Alert, Button } from './ui';

type State = { error?: string };
type Variant = 'primario' | 'secundario' | 'peligro';

/** Botón que dispara un paso de la operación y muestra el error si vuelve uno. */
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
