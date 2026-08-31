'use client';

import { useActionState, useState } from 'react';
import { Alert, Button, Field } from './ui';

type State = { error?: string };

const COMISION = 0.05;

/**
 * Al ofertar se muestra en vivo cuánto termina pagando el comprador. La
 * comisión del 5 % no debería ser una sorpresa en el checkout.
 */
export function OfferForm({
    action,
    askingPrice,
}: {
    action: (state: State, form: FormData) => Promise<State>;
    askingPrice: number;
}) {
    const [state, submit, pending] = useActionState(action, {});
    const [money, setMonto] = useState(askingPrice);

    const total = money * (1 + COMISION);
    const fmt = (n: number) =>
        new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

    return (
        <form action={submit} className="flex flex-col gap-4">
            <Field
                label="Tu oferta (USD)"
                name="money"
                type="number"
                min={1}
                step={1}
                required
                value={Number.isFinite(money) ? money : ''}
                onChange={(e) => setMonto(Number(e.target.value))}
            />

            <div className="flex flex-col gap-2 rounded-[var(--radius-chico)] border border-[var(--color-borde)] p-4">
                <div className="flex justify-between text-[13px]">
                    <span className="text-[var(--color-tenue)]">Tu oferta</span>
                    <span className="font-mono">{fmt(money || 0)}</span>
                </div>
                <div className="flex justify-between text-[13px]">
                    <span className="text-[var(--color-tenue)]">Comisión de la plataforma (5 %)</span>
                    <span className="font-mono">{fmt((money || 0) * COMISION)}</span>
                </div>
                <div className="mt-1 flex justify-between border-t border-[var(--color-borde)] pt-2.5 text-[14px]">
                    <span className="font-medium">Pagás en total</span>
                    <span className="font-mono font-bold text-[var(--color-acento)]">{fmt(total || 0)}</span>
                </div>
            </div>

            {state.error && <Alert>{state.error}</Alert>}

            <Button type="submit" disabled={pending} className="w-full">
                {pending ? 'Enviando…' : 'Enviar oferta'}
            </Button>

            <p className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                Ofertar no compromete el pago: recién transferís cuando el activo ya esté en
                custodia de la plataforma.
            </p>
        </form>
    );
}
