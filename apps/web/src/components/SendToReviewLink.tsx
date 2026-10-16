'use client';

import { useActionState } from 'react';
import { Alert } from './ui';
import { ActionFailure } from './OperationAction';

type State = {
    error?: string;
    ok?: boolean;
    message?: string;
    next?: { href: string; label: string };
};

/**
 * La salida de quien no puede cargar el registro de DNS: mandar el sitio a
 * revisión a mano. Es un botón con forma de enlace, porque es la alternativa y
 * no lo que se espera que haga; al confirmarse queda el aviso en su lugar.
 */
export function SendToReviewLink({ action }: { action: (state: State) => Promise<State> }) {
    const [state, submit, pending] = useActionState(action, {});

    if (state.ok && state.message) return <Alert tono="listo">{state.message}</Alert>;

    return (
        <div className="flex flex-col gap-2.5">
            {state.error && <ActionFailure error={state.error} next={state.next} />}
            <form action={submit}>
                <button
                    type="submit"
                    disabled={pending}
                    className="min-h-11 text-[14px] text-[var(--color-tenue)] underline underline-offset-[3px] hover:text-[var(--color-tinta)] disabled:opacity-60"
                >
                    {pending ? 'Un momento…' : 'No puedo cargar el registro'}
                </button>
            </form>
        </div>
    );
}
