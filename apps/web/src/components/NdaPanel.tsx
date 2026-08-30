'use client';

import { useActionState } from 'react';
import { Alert, Button } from './ui';
import { LockIcon } from './LockIcon';

type State = { error?: string };

/**
 * El bloque que convierte un listing blind en uno legible.
 *
 * Los campos ocultos se listan por nombre: el usuario ve exactamente qué está
 * comprando a ciegas antes de decidir si firma.
 */
export function NdaPanel({
    action,
    hiddenFields,
    authenticated,
}: {
    action: (state: State) => Promise<State>;
    hiddenFields: string[];
    authenticated: boolean;
}) {
    const [state, submit, pending] = useActionState(action, {});

    return (
        <div className="flex flex-col gap-4 rounded-[var(--radius-medio)] border border-[var(--color-alerta)]/40 bg-[var(--color-superficie)] p-5">
            <div className="flex items-center gap-2">
                <LockIcon tamano={13} />
                <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-alerta)]">
                    DATOS BAJO CONFIDENCIALIDAD
                </span>
            </div>

            <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                El seller eligió no exponer públicamente los form que identifican el asset.
                Firmá el acuerdo de confidencialidad para verlos.
            </p>

            {hiddenFields.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                    {hiddenFields.map((campo) => (
                        <li
                            key={campo}
                            className="rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] px-2.5 py-1 font-mono text-[11px] text-[var(--color-apagado)]"
                        >
                            {campo}
                        </li>
                    ))}
                </ul>
            )}

            {state.error && <Alert>{state.error}</Alert>}

            <form action={submit}>
                <Button type="submit" disabled={pending} className="w-full">
                    {pending ? 'Firmando…' : authenticated ? 'Firmar NDA y ver los datos' : 'Ingresar para firmar'}
                </Button>
            </form>

            <p className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                Firmar requiere tener la identidad verificada. Queda registrada la date y la IP.
            </p>
        </div>
    );
}
