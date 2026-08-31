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
import { requireCounterparty } from '@/lib/guards';

export type ActionState = { error?: string };

export async function signNda(
    listingId: string,
    _estado: ActionState,
): Promise<ActionState> {
    await requireCounterparty();

    try {
        await api().signNda(listingId);
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos firmar el NDA. Probá de nuevo.' };
    }

    // El listing cambia de contenido al firmar: hay que invalidar la caché
    // de la ruta o el usuario sigue viendo los datos ocultos.
    revalidatePath(`/listings/${listingId}`);
    return {};
}

export async function makeOffer(
    listingId: string,
    _estado: ActionState,
    form: FormData,
): Promise<ActionState> {
    await requireCounterparty();

    const amount = Number(form.get('money'));
    if (!Number.isFinite(amount) || amount <= 0) {
        return { error: 'Ingresá un monto válido.' };
    }

    try {
        await api().createOffer(listingId, {
            offerPrice: { cents: Math.round(amount * 100), currency: 'USD' },
        });
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos registrar la oferta. Probá de nuevo.' };
    }

    revalidatePath(`/listings/${listingId}`);
    return {};
}
