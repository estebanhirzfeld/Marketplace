'use client';

import { useActionState, useEffect, useId, useRef } from 'react';
import { ASSET_NICHES } from '@marketplace/shared-types';
import { nicheLabel } from '@/lib/format';
import type { ActionState } from '@/app/vender/actions';
import { Alert, Button } from './ui';

type EditAction = (state: ActionState, form: FormData) => Promise<ActionState>;

const CONTROL =
    'min-h-[48px] rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] bg-[var(--color-fondo)] text-[var(--color-tinta)] outline-none focus:border-[var(--color-acento)]';

/**
 * Editar el activo desde un diálogo.
 *
 * `scope="listing"` es el borrador: rubro, «sin rostro» (solo canales), precio y
 * moneda. `scope="price"` es el publicado, que solo deja cambiar precio y
 * moneda: lo demás es lo que vio el comprador al ofertar. El diálogo nativo
 * atrapa el foco y cierra con Esc.
 */
export function EditListingDialog({
    action,
    scope,
    niche,
    noFace,
    showNoFace,
    priceCents,
    currency,
}: {
    action: EditAction;
    scope: 'listing' | 'price';
    niche?: string;
    noFace?: boolean;
    /** «Sin rostro» solo existe en los canales. */
    showNoFace?: boolean;
    priceCents: number;
    currency: string;
}) {
    const [state, submit, pending] = useActionState(action, {});
    const dialogRef = useRef<HTMLDialogElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const titleId = useId();

    useEffect(() => {
        if (state.ok) dialogRef.current?.close();
    }, [state]);

    return (
        <>
            <Button
                ref={triggerRef}
                type="button"
                variant="secundario"
                className="px-4 py-2.5"
                onClick={() => dialogRef.current?.showModal()}
            >
                {scope === 'price' ? 'Cambiar precio' : 'Editar'}
            </Button>

            <dialog
                ref={dialogRef}
                aria-labelledby={titleId}
                onClose={() => triggerRef.current?.focus()}
                onClick={(e) => {
                    if (e.target === dialogRef.current) dialogRef.current?.close();
                }}
                className="m-auto w-[min(480px,calc(100vw-2rem))] rounded-[var(--radius-medio)] border border-[var(--color-borde-fuerte)] bg-[var(--color-superficie)] p-0 text-[var(--color-tinta)] backdrop:bg-black/60"
            >
                <form action={submit} className="flex flex-col gap-5 p-6">
                    <h2 id={titleId} className="text-[18px] font-bold tracking-[-0.02em]">
                        {scope === 'price' ? 'Cambiar el precio' : 'Editar el borrador'}
                    </h2>

                    {scope === 'listing' && (
                        <>
                            <label className="flex flex-col gap-2">
                                <span className="text-[13px] text-[var(--color-tenue)]">Rubro</span>
                                <select name="niche" defaultValue={niche ?? 'other'} className={`${CONTROL} px-3 text-[14px]`}>
                                    {ASSET_NICHES.map((n) => (
                                        <option key={n} value={n}>
                                            {nicheLabel(n)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            {showNoFace && (
                                <label className="flex items-center gap-2.5 text-[14px]">
                                    <input
                                        type="checkbox"
                                        name="sinRostro"
                                        defaultChecked={noFace}
                                        className="h-4 w-4 accent-[var(--color-acento)]"
                                    />
                                    Contenido sin rostro
                                </label>
                            )}
                        </>
                    )}

                    <div className="flex flex-col gap-2">
                        <span className="text-[13px] text-[var(--color-tenue)]">Tu precio</span>
                        <div className="flex gap-2">
                            <select
                                name="moneda"
                                defaultValue={currency === 'ARS' ? 'ARS' : 'USD'}
                                aria-label="Moneda"
                                className={`${CONTROL} px-3 text-[15px]`}
                            >
                                <option value="USD">USD</option>
                                <option value="ARS">ARS</option>
                            </select>
                            <input
                                name="precio"
                                type="number"
                                inputMode="decimal"
                                min={1}
                                step="0.01"
                                required
                                aria-label="Precio"
                                defaultValue={priceCents / 100}
                                className={`${CONTROL} min-w-0 flex-1 px-3.5 font-mono text-[18px]`}
                            />
                        </div>
                    </div>

                    {state.error && <Alert>{state.error}</Alert>}

                    <div className="flex justify-end gap-2.5">
                        <Button type="button" variant="fantasma" onClick={() => dialogRef.current?.close()}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={pending}>
                            {pending ? 'Guardando…' : 'Guardar'}
                        </Button>
                    </div>
                </form>
            </dialog>
        </>
    );
}
