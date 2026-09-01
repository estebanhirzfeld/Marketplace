'use client';

import { useActionState, useState } from 'react';
import { Alert, Button } from './ui';

type State = { error?: string; ok?: boolean; message?: string };

/**
 * Constancia de entrega, simétrica a la de custodia.
 *
 * Cerrar la operación no es un botón: registra a qué identidad se entregó el
 * activo, si el comprador quedó como propietario principal y si se le cedieron
 * los accesos. `buyerIsPrimaryOwner` atestigua además que la segunda espera de
 * siete días se cumplió —sin esos días Google no permite el cambio—, así que
 * no hace falta un temporizador nuevo. El dominio rechaza el cierre si falta
 * la identidad declarada o si alguna casilla llega en falso.
 *
 * `deliveredToIdentifier` no se pide: lo copia el dominio de la identidad que
 * el comprador declaró.
 */
export function DeliveryVerificationForm({
    action,
    recipientIdentifier,
}: {
    action: (state: State, form: FormData) => Promise<State>;
    /** Lo que el comprador declaró. Ausente si todavía no lo hizo. */
    recipientIdentifier?: string;
}) {
    const [state, submit, pending] = useActionState(action, {});
    const [primaryOwner, setPrincipal] = useState(false);
    const [accessTransferred, setAccesos] = useState(false);
    const [sellerRemoved, setVendedor] = useState(false);

    if (!recipientIdentifier) {
        return (
            <p className="rounded-[var(--radius-chico)] border border-[var(--color-borde)] p-4 text-[13px] leading-relaxed text-[var(--color-tenue)]">
                El comprador todavía no declaró dónde quiere recibir el activo. Sin ese dato no hay
                constancia de entrega posible y la operación no se puede cerrar.
            </p>
        );
    }

    const ready = primaryOwner && accessTransferred;

    return (
        <form action={submit} className="flex flex-col gap-4">
            {state.error && <Alert>{state.error}</Alert>}

            <div className="rounded-lg border border-[var(--color-borde)] p-3 text-[13px]">
                <span className="text-[var(--color-tenue)]">Se entrega a </span>
                <span className="font-mono">{recipientIdentifier}</span>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-apagado)]">
                    Copia congelada de lo que el comprador declaró. Si lo cambió después, la
                    constancia igual dice a dónde se entregó de verdad.
                </p>
            </div>

            <Checkbox
                name="buyerIsPrimaryOwner"
                checked={primaryOwner}
                onChange={setPrincipal}
                title="El comprador quedó como propietario principal"
                detail="Atestigua también que su espera de siete días se cumplió: sin esos días Google no permite el cambio."
            />
            <Checkbox
                name="accessTransferred"
                checked={accessTransferred}
                onChange={setAccesos}
                title="Se cedieron los accesos"
                detail="Correos de recuperación y segundo factor pasaron al comprador."
            />
            <Checkbox
                name="sellerRemoved"
                checked={sellerRemoved}
                onChange={setVendedor}
                title="Se quitó al vendedor del activo"
                detail="Ya no figura como propietario ni administrador."
            />

            <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Observaciones</span>
                <textarea
                    name="notes"
                    rows={2}
                    placeholder="Opcional. Cualquier cosa que convenga dejar asentada."
                    className="rounded-lg border border-[var(--color-borde)] bg-transparent p-2.5 text-[13px] leading-relaxed outline-none placeholder:text-[var(--color-apagado)] focus:border-[var(--color-acento)]"
                />
            </label>

            <Button type="submit" disabled={pending || !ready}>
                {pending ? 'Cerrando…' : 'Cerrar la operación'}
            </Button>

            {!ready && (
                <p className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                    Faltan las confirmaciones de propiedad principal y cesión de accesos. Sin ellas
                    la entrega no es efectiva.
                </p>
            )}
        </form>
    );
}

function Checkbox({
    name,
    checked,
    onChange,
    title,
    detail,
}: {
    name: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    title: string;
    detail: string;
}) {
    return (
        <label className="flex cursor-pointer gap-3 rounded-lg border border-[var(--color-borde)] p-3.5 transition-colors hover:border-[var(--color-tenue)]">
            <input
                type="checkbox"
                name={name}
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-acento)]"
            />
            <span className="flex flex-col gap-1">
                <span className="text-[14px] font-medium">{title}</span>
                <span className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                    {detail}
                </span>
            </span>
        </label>
    );
}
