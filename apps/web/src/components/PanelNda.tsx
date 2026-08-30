'use client';

import { useActionState } from 'react';
import { Aviso, Boton } from './ui';
import { Candado } from './Candado';

type Estado = { error?: string };

/**
 * El bloque que convierte un listing blind en uno legible.
 *
 * Los campos ocultos se listan por nombre: el usuario ve exactamente qué está
 * comprando a ciegas antes de decidir si firma.
 */
export function PanelNda({
    accion,
    camposOcultos,
    autenticado,
}: {
    accion: (estado: Estado) => Promise<Estado>;
    camposOcultos: string[];
    autenticado: boolean;
}) {
    const [estado, enviar, pendiente] = useActionState(accion, {});

    return (
        <div className="flex flex-col gap-4 rounded-[var(--radius-medio)] border border-[var(--color-alerta)]/40 bg-[var(--color-superficie)] p-5">
            <div className="flex items-center gap-2">
                <Candado tamano={13} />
                <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-alerta)]">
                    DATOS BAJO CONFIDENCIALIDAD
                </span>
            </div>

            <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                El vendedor eligió no exponer públicamente los datos que identifican el activo.
                Firmá el acuerdo de confidencialidad para verlos.
            </p>

            {camposOcultos.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                    {camposOcultos.map((campo) => (
                        <li
                            key={campo}
                            className="rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] px-2.5 py-1 font-mono text-[11px] text-[var(--color-apagado)]"
                        >
                            {campo}
                        </li>
                    ))}
                </ul>
            )}

            {estado.error && <Aviso>{estado.error}</Aviso>}

            <form action={enviar}>
                <Boton type="submit" disabled={pendiente} className="w-full">
                    {pendiente ? 'Firmando…' : autenticado ? 'Firmar NDA y ver los datos' : 'Ingresar para firmar'}
                </Boton>
            </form>

            <p className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                Firmar requiere tener la identidad verificada. Queda registrada la fecha y la IP.
            </p>
        </div>
    );
}
