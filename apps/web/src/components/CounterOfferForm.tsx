'use client';

import { useActionState, useState } from 'react';
import type { NegotiatingPartyDto } from '@marketplace/api-contract';
import { Alert, Button, Field } from './ui';

type State = { error?: string };

/**
 * La negociación converge: el comprador nunca baja y el vendedor nunca sube
 * respecto de su propia propuesta anterior.
 *
 * El límite se muestra y se aplica al input, así la persona entiende la regla
 * antes de chocar con un 409. La validación real sigue estando en el dominio.
 */
export function CounterOfferForm({
    action,
    precioActual,
    miParte,
    miUltima,
}: {
    action: (state: State, form: FormData) => Promise<State>;
    precioActual: number;
    miParte: NegotiatingPartyDto;
    /** Mi propuesta anterior, si ya hice una. */
    miUltima?: number;
}) {
    const [state, submit, pending] = useActionState(action, {});
    const [money, setMonto] = useState(precioActual);

    const fmt = (n: number) =>
        new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

    const esComprador = miParte === 'buyer';
    const limite = miUltima;

    return (
        <form action={submit} className="flex flex-col gap-4">
            <Field
                label="Tu contraoferta (USD)"
                name="money"
                type="number"
                required
                min={esComprador && limite !== undefined ? limite + 1 : 1}
                max={!esComprador && limite !== undefined ? limite - 1 : undefined}
                value={Number.isFinite(money) ? money : ''}
                onChange={(e) => setMonto(Number(e.target.value))}
                hint={
                    limite === undefined
                        ? 'Es tu primera contraoferta: podés proponer el monto que quieras.'
                        : esComprador
                          ? `Tiene que superar tu propuesta anterior de ${fmt(limite)}.`
                          : `Tiene que ser menor que tu propuesta anterior de ${fmt(limite)}.`
                }
            />

            <div className="flex justify-between rounded-[var(--radius-chico)] border border-[var(--color-borde)] px-4 py-3 text-[13px]">
                <span className="text-[var(--color-tenue)]">Sobre la mesa ahora</span>
                <span className="font-mono">{fmt(precioActual)}</span>
            </div>

            {state.error && <Alert>{state.error}</Alert>}

            <Button type="submit" variant="secundario" disabled={pending} className="w-full">
                {pending ? 'Enviando…' : 'Contraofertar'}
            </Button>

            <p className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                Las contraofertas se acercan en cada paso, así la negociación termina. Si
                necesitás moverte en la otra dirección, cancelá la operación y ofertá de nuevo.
            </p>
        </form>
    );
}
