'use client';

import { useActionState } from 'react';
import { Alert, Button } from './ui';

type State = { error?: string; ok?: boolean; message?: string };

/**
 * El admin rechaza una declaración de cesión que no llegó. El motivo es lo
 * que va a leer el vendedor, así que se pide escrito y no se ofrece una lista.
 */
export function RejectTransferForm({ action }: { action: (state: State, form: FormData) => Promise<State> }) {
    const [state, submit, pending] = useActionState(action, {});

    return (
        <form action={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Motivo</span>
                <textarea
                    name="reason"
                    rows={2}
                    required
                    maxLength={2000}
                    placeholder="Qué no llegó o qué falta, dicho al vendedor."
                    className="rounded-lg border border-[var(--color-borde)] bg-transparent p-2.5 text-[13px] leading-relaxed outline-none placeholder:text-[var(--color-apagado)] focus:border-[var(--color-acento)]"
                />
            </label>
            {state.error && <Alert>{state.error}</Alert>}
            {state.ok && state.message && <Alert tono="listo">{state.message}</Alert>}
            <Button type="submit" variant="peligro" disabled={pending}>
                {pending ? 'Rechazando…' : 'Rechazar la cesión'}
            </Button>
        </form>
    );
}
