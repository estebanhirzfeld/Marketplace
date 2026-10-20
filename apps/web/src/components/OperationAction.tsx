'use client';

import { useActionState } from 'react';
import { Alert, Button, ButtonLink } from './ui';

type State = {
    error?: string;
    ok?: boolean;
    message?: string;
    next?: { href: string; label: string };
};
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
            {state.error && <ActionFailure error={state.error} next={state.next} />}
            <form action={submit}>
                <Button type="submit" variant={variant} disabled={pending} className="w-full">
                    {pending ? 'Un momento…' : text}
                </Button>
            </form>
            {note && <p className="text-[12px] leading-relaxed text-[var(--color-apagado)]">{note}</p>}
        </div>
    );
}

/**
 * El error de un paso y, si existe, el camino hacia donde se resuelve.
 *
 * Un mensaje que dice "tenés que vincular tu cuenta" sin un enlace deja a la
 * persona buscando la pantalla; el enlace es el siguiente paso, no un adorno.
 */
export function ActionFailure({
    error,
    next,
}: {
    error: string;
    next?: { href: string; label: string };
}) {
    return (
        <div className="flex flex-col gap-2.5">
            <Alert>{error}</Alert>
            {next && (
                <ButtonLink href={next.href} variant="secundario">
                    {next.label}
                </ButtonLink>
            )}
        </div>
    );
}
