'use client';

import { useActionState, useState } from 'react';
import { Aviso, Boton, Campo } from './ui';

type Estado = { error?: string };

const COMISION = 0.05;

/**
 * Al ofertar se muestra en vivo cuánto termina pagando el comprador. La
 * comisión del 5 % no debería ser una sorpresa en el checkout.
 */
export function FormularioOferta({
    accion,
    precioPedido,
}: {
    accion: (estado: Estado, datos: FormData) => Promise<Estado>;
    precioPedido: number;
}) {
    const [estado, enviar, pendiente] = useActionState(accion, {});
    const [monto, setMonto] = useState(precioPedido);

    const total = monto * (1 + COMISION);
    const fmt = (n: number) =>
        new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

    return (
        <form action={enviar} className="flex flex-col gap-4">
            <Campo
                etiqueta="Tu oferta (USD)"
                name="monto"
                type="number"
                min={1}
                step={1}
                required
                value={Number.isFinite(monto) ? monto : ''}
                onChange={(e) => setMonto(Number(e.target.value))}
            />

            <div className="flex flex-col gap-2 rounded-[var(--radius-chico)] border border-[var(--color-borde)] p-4">
                <div className="flex justify-between text-[13px]">
                    <span className="text-[var(--color-tenue)]">Tu oferta</span>
                    <span className="font-mono">{fmt(monto || 0)}</span>
                </div>
                <div className="flex justify-between text-[13px]">
                    <span className="text-[var(--color-tenue)]">Comisión de la plataforma (5 %)</span>
                    <span className="font-mono">{fmt((monto || 0) * COMISION)}</span>
                </div>
                <div className="mt-1 flex justify-between border-t border-[var(--color-borde)] pt-2.5 text-[14px]">
                    <span className="font-medium">Pagás en total</span>
                    <span className="font-mono font-bold text-[var(--color-acento)]">{fmt(total || 0)}</span>
                </div>
            </div>

            {estado.error && <Aviso>{estado.error}</Aviso>}

            <Boton type="submit" disabled={pendiente} className="w-full">
                {pendiente ? 'Enviando…' : 'Enviar oferta'}
            </Boton>

            <p className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                Ofertar no compromete el pago: recién transferís cuando el activo esté en custodia
                de la plataforma.
            </p>
        </form>
    );
}
