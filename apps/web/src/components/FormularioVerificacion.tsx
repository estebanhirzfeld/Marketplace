'use client';

import { useActionState } from 'react';
import { Aviso, Boton, Campo } from './ui';

type Estado = { error?: string; ok?: boolean };

export function FormularioVerificacion({
    accion,
}: {
    accion: (estado: Estado, datos: FormData) => Promise<Estado>;
}) {
    const [estado, enviar, pendiente] = useActionState(accion, {});

    if (estado.ok) {
        return (
            <div className="flex flex-col gap-4">
                <div className="rounded-[var(--radius-chico)] border border-[var(--color-acento)]/40 px-4 py-3 text-[14px] text-[var(--color-acento)]">
                    Identidad verificada. Ya podés publicar activos y firmar.
                </div>
            </div>
        );
    }

    return (
        <form action={enviar} className="flex flex-col gap-4">
            <Campo
                etiqueta="Número de documento"
                name="dni"
                required
                placeholder="20123456"
                ayuda="Entre 7 y 11 dígitos. Se acepta con puntos."
            />
            <Campo etiqueta="Teléfono (opcional)" name="phone" placeholder="+54 11 5555 0000" />
            <Campo etiqueta="País (opcional)" name="country" maxLength={2} placeholder="AR" ayuda="Código de dos letras." />

            {estado.error && <Aviso>{estado.error}</Aviso>}

            <Boton type="submit" disabled={pendiente} className="mt-1 w-full">
                {pendiente ? 'Verificando…' : 'Verificar mi identidad'}
            </Boton>
        </form>
    );
}
