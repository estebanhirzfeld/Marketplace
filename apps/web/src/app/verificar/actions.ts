'use server';

/*
 * Las Server Actions son un punto de entrada propio: se invocan por HTTP y
 * no pasan por la guarda de la pantalla que las muestra. Los docs de Next
 * piden tratarlas como endpoints públicos, así que cada una vuelve a exigir
 * la sesión. No reemplaza a la API ni al dominio, que validan igual: evita
 * que una llamada sin sesión devuelva un error confuso en vez de redirigir.
 */

import { revalidatePath } from 'next/cache';
import { ApiError } from '@marketplace/api-client';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/guards';

export type ActionState = { error?: string; ok?: boolean };

export async function verifyIdentityAction(
    _estado: ActionState,
    form: FormData,
): Promise<ActionState> {
    await requireSession();
    const dni = String(form.get('dni') ?? '');
    const phone = String(form.get('phone') ?? '').trim() || undefined;
    const country = String(form.get('country') ?? '').trim() || undefined;

    try {
        await api().verifyIdentity({ dni, phone, country });
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos verificar tu identidad. Probá de nuevo.' };
    }

    // El estado de KYC afecta el aviso del layout y los gates de todas las
    // pantallas: hay que invalidar todo, no solo esta ruta.
    revalidatePath('/', 'layout');
    return { ok: true };
}
