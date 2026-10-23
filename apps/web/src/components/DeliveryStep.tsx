'use client';

import { useActionState } from 'react';
import { Alert, Button } from './ui';

type State = { error?: string; ok?: boolean; message?: string };
type Action = (state: State, form: FormData) => Promise<State>;

/**
 * Un paso de la entrega de un canal: quien lo hizo lo confirma con un botón.
 * El loader va en el mismo botón, sin reemplazar la tarjeta; al terminar dice
 * qué sigue. La recepción del comprador suma qué comprobar y el reclamo.
 */
export function DeliveryStep({
    action,
    label,
    checks,
    claimHref,
}: {
    action: Action;
    label: string;
    checks?: string[];
    claimHref?: string;
}) {
    const [state, submit, pending] = useActionState(action, {});
    if (state.ok && state.message) return <Alert tono="listo">{state.message}</Alert>;

    return (
        <div className="flex flex-col gap-4">
            {checks && checks.length > 0 && (
                <ul className="flex flex-col gap-2 text-[14px] leading-relaxed">
                    {checks.map((c) => (
                        <li key={c}>{c}</li>
                    ))}
                </ul>
            )}
            {state.error && <Alert>{state.error}</Alert>}
            <div className="flex flex-wrap items-center gap-3">
                <form action={submit}>
                    <Button type="submit" disabled={pending}>
                        {pending ? 'Registrando…' : label}
                    </Button>
                </form>
                {claimHref && (
                    <a href={claimHref} className="inline-flex min-h-[44px] items-center text-[14px] text-[var(--color-acento)]">
                        Tengo un problema
                    </a>
                )}
            </div>
        </div>
    );
}
