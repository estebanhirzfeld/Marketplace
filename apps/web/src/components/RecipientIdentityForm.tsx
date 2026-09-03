'use client';

import { useActionState } from 'react';
import { Alert, Button } from './ui';

type State = { error?: string; ok?: boolean; message?: string };

/**
 * El comprador declara dónde quiere recibir el activo.
 *
 * Es una tarea pendiente: se puede resolver temprano y conviene hacerlo, pero
 * nadie la impone antes de tiempo. Desde que el activo está en custodia sube
 * de tono, porque a partir de ahí es lo que demora su propia entrega: la
 * invitación al comprador no puede salir sin este dato.
 */
export function RecipientIdentityForm({
    action,
    urgente,
    valorActual,
}: {
    action: (state: State, form: FormData) => Promise<State>;
    urgente: boolean;
    /** Si ya la declaró y esto es una corrección. */
    valorActual?: string;
}) {
    const [state, submit, pending] = useActionState(action, {});

    return (
        <form
            action={submit}
            className={`flex flex-col gap-3 rounded-[var(--radius-chico)] border p-4 ${
                urgente
                    ? 'border-[var(--color-alerta)]/50 bg-[var(--color-alerta)]/5'
                    : 'border-[var(--color-borde)]'
            }`}
        >
            {state.error && <Alert>{state.error}</Alert>}

            <div className="flex flex-col gap-1">
                <span className="text-[13px] font-medium">
                    {valorActual ? 'Corregir tu cuenta receptora' : 'Declarar dónde recibir el activo'}
                    {urgente && !valorActual && (
                        <span className="ml-2 font-mono text-[10px] text-[var(--color-alerta)]">
                            PENDIENTE
                        </span>
                    )}
                </span>
                <span className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                    {urgente
                        ? 'El activo ya está en custodia. Sin esta cuenta no podemos invitarte, y de esa invitación cuelgan tus siete días de espera.'
                        : 'Para un canal, es la cuenta de Google que vas a querer como propietaria. Para un dominio, tu usuario del registrador. Podés cambiarla mientras la operación no se haya cerrado.'}
                </span>
            </div>

            <input
                name="identifier"
                required
                defaultValue={valorActual}
                placeholder="tu-cuenta@gmail.com"
                className="rounded-lg border border-[var(--color-borde)] bg-transparent p-2.5 font-mono text-[13px] outline-none focus:border-[var(--color-acento)]"
            />

            <Button type="submit" disabled={pending} className="text-[13px]">
                {pending ? 'Guardando…' : valorActual ? 'Guardar el cambio' : 'Declarar la cuenta'}
            </Button>
        </form>
    );
}
