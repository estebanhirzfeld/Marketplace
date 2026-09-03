'use client';

import { useActionState } from 'react';
import type { CustodyAccountDto } from '@marketplace/api-contract';
import { Alert, Button } from './ui';

type State = { error?: string; ok?: boolean };
type Accion = (state: State, form: FormData) => Promise<State>;

/**
 * Alta y edición de una cuenta de custodia.
 *
 * Solo se guarda el `identifier` —la dirección que el vendedor invita o el
 * usuario del registrador—, nunca una credencial: un identificador filtrado no
 * entrega el acceso. El `assetType` no se puede cambiar mientras la cuenta
 * sostenga activos; el dominio lo rechaza y el error se muestra acá.
 */
export function CustodyAccountForm({
    action,
    cuenta,
    onDone,
}: {
    action: Accion;
    /** Presente al editar; ausente al dar de alta. */
    cuenta?: CustodyAccountDto;
    onDone?: () => void;
}) {
    const [state, submit, pending] = useActionState(async (s: State, f: FormData) => {
        const r = await action(s, f);
        if (r.ok) onDone?.();
        return r;
    }, {});

    const editando = Boolean(cuenta);

    return (
        <form action={submit} className="flex flex-col gap-4">
            {state.error && <Alert>{state.error}</Alert>}

            <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Etiqueta</span>
                <input
                    name="label"
                    required
                    defaultValue={cuenta?.label}
                    placeholder="Custodia YouTube 01"
                    className="rounded-lg border border-[var(--color-borde)] bg-transparent p-2.5 text-[13px] outline-none focus:border-[var(--color-acento)]"
                />
                <span className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                    Cómo la nombra la operación por dentro. No la ve el vendedor.
                </span>
            </label>

            <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Identificador</span>
                <input
                    name="identifier"
                    required
                    defaultValue={cuenta?.identifier}
                    placeholder="custodia-yt-01@traspaso.com"
                    className="rounded-lg border border-[var(--color-borde)] bg-transparent p-2.5 font-mono text-[13px] outline-none focus:border-[var(--color-acento)]"
                />
                <span className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                    La dirección que el vendedor invita como propietaria. Nunca una contraseña ni un
                    segundo factor.
                </span>
            </label>

            <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Tipo de activo</span>
                <select
                    name="assetType"
                    defaultValue={cuenta?.assetType ?? 'youtube'}
                    className="rounded-lg border border-[var(--color-borde)] bg-transparent p-2.5 text-[13px] outline-none focus:border-[var(--color-acento)]"
                >
                    <option value="youtube">Canal de YouTube</option>
                    <option value="web">Sitio web</option>
                </select>
                {editando && cuenta!.heldAssets > 0 && (
                    <span className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                        Sostiene {cuenta!.heldAssets} activo{cuenta!.heldAssets === 1 ? '' : 's'}: el
                        tipo no se puede cambiar hasta que deje de sostenerlos.
                    </span>
                )}
            </label>

            <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Observaciones</span>
                <textarea
                    name="notes"
                    rows={2}
                    defaultValue={cuenta?.notes}
                    placeholder="Cuenta de Marca propietaria. Reemplazar el identifier por el real."
                    className="rounded-lg border border-[var(--color-borde)] bg-transparent p-2.5 text-[13px] leading-relaxed outline-none placeholder:text-[var(--color-apagado)] focus:border-[var(--color-acento)]"
                />
            </label>

            <Button type="submit" disabled={pending}>
                {pending
                    ? 'Guardando…'
                    : editando
                      ? 'Guardar los cambios'
                      : 'Dar de alta la cuenta'}
            </Button>
        </form>
    );
}
