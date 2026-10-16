'use client';

import { useActionState, useState } from 'react';
import { Alert, Button } from './ui';
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
 *
 * Va en dos pasos, como «Borrar borrador»: el primer toque solo pregunta,
 * porque enviar a revisión es lento y fácil de tocar sin querer al lado del
 * botón de DNS.
 */
export function SendToReviewLink({ action }: { action: (state: State) => Promise<State> }) {
    const [confirming, setConfirming] = useState(false);
    const [state, submit, pending] = useActionState(action, {});

    return (
        <SendToReviewLinkView
            state={state}
            confirming={confirming}
            pending={pending}
            onAsk={() => setConfirming(true)}
            onCancel={() => setConfirming(false)}
            submit={submit}
        />
    );
}

/** La vista sin estado, para dibujar cada paso por separado. */
export function SendToReviewLinkView({
    state,
    confirming,
    pending,
    onAsk,
    onCancel,
    submit,
}: {
    state: State;
    confirming: boolean;
    pending: boolean;
    onAsk: () => void;
    onCancel: () => void;
    submit: (formData: FormData) => void;
}) {
    if (state.ok && state.message) return <Alert tono="listo">{state.message}</Alert>;

    if (!confirming) {
        return (
            <button
                type="button"
                onClick={onAsk}
                className="min-h-11 self-start text-[14px] text-[var(--color-tenue)] underline underline-offset-[3px] hover:text-[var(--color-tinta)]"
            >
                No puedo cargar el registro
            </button>
        );
    }

    return (
        <div role="alertdialog" aria-label="Confirmar el envío a revisión" className="flex flex-col gap-2.5">
            {state.error && <ActionFailure error={state.error} next={state.next} />}
            <span className="text-[13px] text-[var(--color-tenue)]">Lo revisamos a mano y tarda más. ¿Lo enviamos a revisión?</span>
            <form action={submit} className="flex gap-2">
                <Button type="button" variant="fantasma" className="px-4 py-2.5" onClick={onCancel}>
                    Cancelar
                </Button>
                <Button type="submit" variant="secundario" disabled={pending} className="px-4 py-2.5">
                    {pending ? 'Enviando…' : 'Sí, enviar a revisión'}
                </Button>
            </form>
        </div>
    );
}
