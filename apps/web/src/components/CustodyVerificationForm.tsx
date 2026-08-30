'use client';

import { useActionState, useState } from 'react';
import { Alert, Button } from './ui';

type State = { error?: string };

/**
 * Confirmar la custodia es el momento en que la plataforma asume el riesgo y
 * habilita el pedido de pago al comprador. Por eso no es un botón: el admin
 * declara qué verificó y esa declaración queda registrada con su nombre.
 *
 * Las dos casillas no son burocracia. Mientras la plataforma sea propietaria
 * pero no principal, el vendedor conserva la facultad de expulsarla: pedirle
 * el pago al comprador ahí lo expondría justo al riesgo que el escrow existe
 * para eliminar. El dominio rechaza el registro si alguna llega en `false`.
 */
export function CustodyVerificationForm({
    action,
}: {
    action: (state: State, form: FormData) => Promise<State>;
}) {
    const [state, submit, pending] = useActionState(action, {});
    const [primaryOwner, setPrincipal] = useState(false);
    const [accessSecured, setAccesos] = useState(false);

    const ready = primaryOwner && accessSecured;

    return (
        <form action={submit} className="flex flex-col gap-4">
            {state.error && <Alert>{state.error}</Alert>}

            <Checkbox
                name="isPrimaryOwner"
                checked={primaryOwner}
                onChange={setPrincipal}
                title="La plataforma es propietaria principal"
                detail="No alcanza con figurar como propietaria. Hasta que el cambio de propietario principal se completa, el vendedor puede revertir la cesión."
            />

            <Checkbox
                name="accessSecured"
                checked={accessSecured}
                onChange={setAccesos}
                title="Los accesos están asegurados"
                detail="Correos de recuperación y segundo factor bajo control de la plataforma."
            />

            <Field
                name="metrics"
                label="Métricas al momento de la verificación"
                note="Un dato por línea, con el formato nombre: número. Queda como foto del estado del activo."
                placeholder={'suscriptores: 55000\nvistas_mensuales: 1200000'}
                rows={3}
            />

            <Field
                name="notes"
                label="Observaciones"
                note="Opcional. Cualquier cosa que convenga dejar asentada."
                placeholder="Sin strikes activos. Monetización habilitada."
                rows={2}
            />

            <Button type="submit" disabled={pending || !ready}>
                {pending ? 'Registrando…' : 'Registrar la custodia'}
            </Button>

            {!ready && (
                <p className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                    Faltan las dos confirmaciones. Sin ellas la custodia no es efectiva y no
                    corresponde pedirle el pago al buyer.
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

function Field({
    name,
    label,
    note,
    placeholder,
    rows,
}: {
    name: string;
    label: string;
    note: string;
    placeholder: string;
    rows: number;
}) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">{label}</span>
            <textarea
                name={name}
                rows={rows}
                placeholder={placeholder}
                className="rounded-lg border border-[var(--color-borde)] bg-transparent p-2.5 font-mono text-[13px] leading-relaxed outline-none placeholder:text-[var(--color-apagado)] focus:border-[var(--color-acento)]"
            />
            <span className="text-[12px] leading-relaxed text-[var(--color-apagado)]">{note}</span>
        </label>
    );
}
