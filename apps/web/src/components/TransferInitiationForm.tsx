'use client';

import { useActionState, useState } from 'react';
import type { HandoverStepDto } from '@marketplace/api-contract';
import { Alert, Button } from './ui';

type State = { error?: string };

/**
 * El vendedor declara haber cedido el control del activo.
 *
 * Reemplaza al botón sin registro: iniciar la transferencia dejó de
 * significar "alguien apretó un botón" para significar "el vendedor afirmó
 * que ya cedió el control, con fecha y atribución". El dominio rechaza una
 * declaración negativa, así que la casilla es lo que habilita el envío.
 *
 * `steps` puede llegar vacío —el caso de un listing web, cuya estrategia no
 * enumera ningún paso posterior a la firma—. El formulario tiene que ser
 * correcto con la lista vacía: la frase genérica, la casilla y el envío
 * siguen funcionando, sin filtrar vocabulario de un tipo de activo en el
 * código compartido.
 */
export function TransferInitiationForm({
    action,
    steps,
}: {
    action: (state: State, form: FormData) => Promise<State>;
    steps: HandoverStepDto[];
}) {
    const [state, submit, pending] = useActionState(action, {});
    const [controlCeded, setControlCeded] = useState(false);

    return (
        <form action={submit} className="flex flex-col gap-4">
            {state.error && <Alert>{state.error}</Alert>}

            <p className="text-[13px] leading-relaxed text-[var(--color-apagado)]">
                Queda un último paso tuyo: ceder el control del activo a la plataforma.
            </p>

            {steps.length > 0 && (
                <ol className="flex flex-col gap-3 rounded-lg border border-[var(--color-borde)] p-3.5">
                    {steps.map((paso, i) => (
                        <li key={paso.id} className="flex gap-3 text-[13px]">
                            <span className="font-mono text-[12px] text-[var(--color-acento)]">
                                {i + 1}
                            </span>
                            <span className="leading-relaxed text-[var(--color-tenue)]">
                                {paso.instruction ?? paso.description}
                            </span>
                        </li>
                    ))}
                </ol>
            )}

            <label className="flex cursor-pointer gap-3 rounded-lg border border-[var(--color-borde)] p-3.5 transition-colors hover:border-[var(--color-tenue)]">
                <input
                    type="checkbox"
                    name="controlCeded"
                    checked={controlCeded}
                    onChange={(e) => setControlCeded(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--color-acento)]"
                />
                <span className="flex flex-col gap-1">
                    <span className="text-[14px] font-medium">Ya cedí el control del activo</span>
                    <span className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                        Recién con esta declaración la plataforma verifica y toma la custodia.
                    </span>
                </span>
            </label>

            <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Observaciones</span>
                <textarea
                    name="notes"
                    rows={2}
                    placeholder="Opcional. Cualquier cosa que convenga dejar asentada."
                    className="rounded-lg border border-[var(--color-borde)] bg-transparent p-2.5 font-mono text-[13px] leading-relaxed outline-none placeholder:text-[var(--color-apagado)] focus:border-[var(--color-acento)]"
                />
            </label>

            <Button type="submit" disabled={pending || !controlCeded}>
                {pending ? 'Declarando…' : 'Declarar la cesión'}
            </Button>

            {!controlCeded && (
                <p className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                    Sin esta declaración la transferencia no puede iniciarse: es la única
                    transición del escrow que la plataforma no puede ejecutar por su cuenta.
                </p>
            )}
        </form>
    );
}
