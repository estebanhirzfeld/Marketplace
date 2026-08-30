'use client';

import { useActionState } from 'react';
import { Aviso, Boton } from './ui';

type Estado = { error?: string };
type Variante = 'primario' | 'secundario' | 'peligro';

/** Botón que dispara un paso de la operación y muestra el error si vuelve uno. */
export function AccionOperacion({
    accion,
    texto,
    variante = 'primario',
    nota,
}: {
    accion: (estado: Estado) => Promise<Estado>;
    texto: string;
    variante?: Variante;
    nota?: string;
}) {
    const [estado, enviar, pendiente] = useActionState(accion, {});

    return (
        <div className="flex flex-col gap-2.5">
            {estado.error && <Aviso>{estado.error}</Aviso>}
            <form action={enviar}>
                <Boton type="submit" variante={variante} disabled={pendiente} className="w-full">
                    {pendiente ? 'Un momento…' : texto}
                </Boton>
            </form>
            {nota && <p className="text-[12px] leading-relaxed text-[var(--color-apagado)]">{nota}</p>}
        </div>
    );
}
