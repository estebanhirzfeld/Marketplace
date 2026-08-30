'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError } from '@marketplace/api-client';
import { api } from '@/lib/api';
import { currentActor } from '@/lib/session';

export type ActionState = { error?: string };

export async function signNda(
    listingId: string,
    _estado: ActionState,
): Promise<ActionState> {
    if (!(await currentActor())) redirect('/ingresar');

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
    if (!(await currentActor())) redirect('/ingresar');

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
