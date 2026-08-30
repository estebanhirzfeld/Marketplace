'use server';

import { redirect } from 'next/navigation';
import { ApiError } from '@marketplace/api-client';
import { apiAnonima } from '@/lib/api';
import { guardarSesion } from '@/lib/sesion';

export type EstadoFormulario = { error?: string };

/**
 * El token se firma en la API y se guarda en una cookie httpOnly desde el
 * servidor. Nunca pasa por JavaScript del navegador.
 */
export async function ingresar(
    _estado: EstadoFormulario,
    datos: FormData,
): Promise<EstadoFormulario> {
    const email = String(datos.get('email') ?? '');
    const password = String(datos.get('password') ?? '');

    try {
        const { token, actor } = await apiAnonima().login({ email, password });
        await guardarSesion(token, actor);
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos conectar con el servidor. Probá de nuevo.' };
    }

    // redirect() lanza: tiene que quedar fuera del try o lo captura el catch.
    redirect('/listings');
}
