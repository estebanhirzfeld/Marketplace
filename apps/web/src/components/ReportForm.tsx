'use client';

import { useActionState, useState } from 'react';
import type { ReportReasonDto } from '@marketplace/api-contract';
import { Alert, Button } from './ui';
import { MOTIVOS } from './ReportReasons';

type State = { error?: string };

/**
 * Abrir un reclamo.
 *
 * Está detrás de un paso extra a propósito: no es una acción más de la
 * operación, y conviene que quien la usa lea antes qué hace y qué no hace la
 * plataforma. Prometer un arbitraje que no existe sería peor que no ofrecer
 * nada.
 */
export function ReportForm({ action }: { action: (state: State, form: FormData) => Promise<State> }) {
    const [state, submit, pending] = useActionState(action, {});
    const [open, setOpen] = useState(false);

    if (!open) {
        return (
            <Button
                type="button"
                variant="peligro"
                onClick={() => setOpen(true)}
                className="w-full"
            >
                Abrir un reclamo
            </Button>
        );
    }

    return (
        <form action={submit} className="flex flex-col gap-4">
            {state.error && <Alert>{state.error}</Alert>}

            <p className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                La plataforma no decide quién tiene razón. Registra tu reclamo, avisa a la otra parte
                y les entrega a ambas el legajo con todo lo que quedó documentado —contratos
                firmados con su huella, verificaciones y el historial de la negociación— para que
                puedas iniciar las acciones que correspondan.
            </p>

            <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Motivo</span>
                <select
                    name="motivo"
                    required
                    defaultValue=""
                    className="h-11 rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] bg-[var(--color-fondo)] px-3.5 text-[14px] outline-none focus:border-[var(--color-acento)]"
                >
                    <option value="" disabled>
                        Elegí un motivo
                    </option>
                    {(Object.keys(MOTIVOS) as ReportReasonDto[]).map((k) => (
                        <option key={k} value={k}>
                            {MOTIVOS[k]}
                        </option>
                    ))}
                </select>
            </label>

            <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Qué pasó</span>
                <textarea
                    name="detalle"
                    rows={5}
                    required
                    minLength={20}
                    placeholder="Contá con detalle qué se declaró, qué encontraste y desde cuándo."
                    className="rounded-lg border border-[var(--color-borde)] bg-transparent p-2.5 text-[13px] leading-relaxed outline-none placeholder:text-[var(--color-apagado)] focus:border-[var(--color-acento)]"
                />
                <span className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                    Lo va a leer la otra parte y queda asentado con fecha.
                </span>
            </label>

            <div className="flex gap-2.5">
                <Button type="submit" variant="peligro" disabled={pending}>
                    {pending ? 'Registrando…' : 'Presentar el reclamo'}
                </Button>
                <Button type="button" variant="fantasma" onClick={() => setOpen(false)}>
                    Volver
                </Button>
            </div>
        </form>
    );
}
