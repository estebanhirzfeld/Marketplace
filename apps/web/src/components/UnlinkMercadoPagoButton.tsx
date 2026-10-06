'use client';

import { useActionState, useState } from 'react';
import { Alert, Button } from './ui';

type State = { error?: string; ok?: boolean };

/**
 * Desvincular la cuenta, con confirmación.
 *
 * Es la acción menos frecuente y la única destructiva del panel, así que arranca
 * como un botón de poco peso y pide una segunda confirmación que dice qué
 * cambia: el mismo patrón que "La plataforma perdió el acceso" en el acceso de
 * custodia.
 *
 * `initiallyConfirming` existe para poder renderizar la pregunta ya abierta en
 * `/sistema` y en los tests, que no pueden hacer clic.
 */
export function UnlinkMercadoPagoButton({
    action,
    initiallyConfirming = false,
}: {
    action: (state: State) => Promise<State>;
    initiallyConfirming?: boolean;
}) {
    const [state, submit, pending] = useActionState(action, {});
    const [confirming, setConfirming] = useState(initiallyConfirming);

    if (!confirming) {
        return (
            <div className="flex flex-col gap-3">
                {state.error && <Alert>{state.error}</Alert>}
                <Button
                    type="button"
                    variant="fantasma"
                    onClick={() => setConfirming(true)}
                    className="self-start px-3 py-1.5 text-[12px]"
                >
                    Desvincular
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3 border-t border-[var(--color-borde)] pt-4">
            {state.error && <Alert>{state.error}</Alert>}
            <p className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                Si desvinculás tu cuenta de Mercado Pago, no vas a poder publicar ni cobrar hasta
                que la vincules de nuevo.
            </p>
            <div className="flex gap-2.5">
                <form action={submit}>
                    <Button
                        type="submit"
                        variant="peligro"
                        disabled={pending}
                        className="px-4 py-2 text-[13px]"
                    >
                        {pending ? 'Desvinculando…' : 'Confirmar'}
                    </Button>
                </form>
                <Button
                    type="button"
                    variant="fantasma"
                    onClick={() => setConfirming(false)}
                    className="px-4 py-2 text-[13px]"
                >
                    Volver
                </Button>
            </div>
        </div>
    );
}
