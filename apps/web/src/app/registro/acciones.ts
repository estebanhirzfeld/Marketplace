'use server';

import { redirect } from 'next/navigation';
import { ApiError } from '@marketplace/api-client';
import { UserRole } from '@marketplace/shared-types';
import { apiAnonima } from '@/lib/api';
import { guardarSesion } from '@/lib/sesion';

export type EstadoFormulario = { error?: string };

export async function registrar(
    _estado: EstadoFormulario,
    datos: FormData,
): Promise<EstadoFormulario> {
    const email = String(datos.get('email') ?? '');
    const password = String(datos.get('password') ?? '');
    const fullName = String(datos.get('fullName') ?? '');

    try {
        const cliente = apiAnonima();
        // El rol no lo elige el usuario: comprar y vender son posiciones en
        // una relación, no atributos de la persona. Todos nacen igual.
        await cliente.register({ email, password, fullName, role: UserRole.BUYER });

        const { token, actor } = await cliente.login({ email, password });
        await guardarSesion(token, actor);
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos conectar con el servidor. Probá de nuevo.' };
    }

    redirect('/listings');
}
