'use server';

import { redirect } from 'next/navigation';
import { ApiError } from '@marketplace/api-client';
import { anonymousApi } from '@/lib/api';
import { saveSession } from '@/lib/session';

export type FormState = { error?: string };

/**
 * El token se firma en la API y se guarda en una cookie httpOnly desde el
 * servidor. Nunca pasa por JavaScript del navegador.
 */
export async function logIn(
    _state: FormState,
    form: FormData,
): Promise<FormState> {
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');

    try {
        const { token, actor } = await anonymousApi().login({ email, password });
        await saveSession(token, actor);
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos conectar con el servidor. Probá de nuevo.' };
    }

    // redirect() lanza: tiene que quedar fuera del try o lo captura el catch.
    redirect('/listings');
}
