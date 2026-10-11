'use client';

import { useActionState, useState } from 'react';
import type { ActionState } from '@/app/vender/actions';
import { Alert, Button } from './ui';

type Action = (state: ActionState) => Promise<ActionState>;

/**
 * Borrar el borrador, en dos pasos.
 *
 * El primer toque no borra: pide la confirmación ahí mismo, con un botón
 * distinto. No usa `confirm()` del navegador, que bloquea la página y no se
 * puede estilar ni leer con un lector de pantalla de forma consistente.
 */
export function DiscardDraftButton({ action }: { action: Action }) {
    const [confirming, setConfirming] = useState(false);
    const [state, submit, pending] = useActionState(action, {});

    if (!confirming) {
        return (
            <Button type="button" variant="peligro" className="px-4 py-2.5" onClick={() => setConfirming(true)}>
                Borrar borrador
            </Button>
        );
    }

    return (
        <div role="alertdialog" aria-label="Confirmar el borrado" className="flex flex-col items-end gap-2">
            {state.error && <Alert>{state.error}</Alert>}
            <span className="text-[13px] text-[var(--color-tenue)]">Se borra para siempre. ¿Seguro?</span>
            <form action={submit} className="flex gap-2">
                <Button type="button" variant="fantasma" className="px-4 py-2.5" onClick={() => setConfirming(false)}>
                    Cancelar
                </Button>
                <Button type="submit" variant="peligro" disabled={pending} className="px-4 py-2.5">
                    {pending ? 'Borrando…' : 'Sí, borrar'}
                </Button>
            </form>
        </div>
    );
}
