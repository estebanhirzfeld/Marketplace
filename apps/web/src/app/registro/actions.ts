'use server';

import { redirect } from 'next/navigation';
import { ApiError } from '@marketplace/api-client';
import { UserRole } from '@marketplace/shared-types';
import { anonymousApi } from '@/lib/api';
import { saveSession } from '@/lib/session';

export type FormState = { error?: string };

export async function registerUser(
    _state: FormState,
    form: FormData,
): Promise<FormState> {
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    const fullName = String(form.get('fullName') ?? '');

    try {
        const cliente = anonymousApi();
        // El rol no lo elige el usuario: comprar y vender son posiciones en
        // una relación, no atributos de la persona. Todos nacen igual.
        await cliente.register({ email, password, fullName, role: UserRole.BUYER });

        const { token, actor } = await cliente.login({ email, password });
        await saveSession(token, actor);
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos conectar con el servidor. Probá de nuevo.' };
    }

    redirect('/listings');
}
