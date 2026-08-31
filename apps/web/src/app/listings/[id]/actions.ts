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
import { money } from '@/lib/format';

/**
 * El resultado de una acción, para poder contarlo.
 *
 * `ok` con su mensaje existe porque antes solo se devolvía el error: cuando
 * algo salía bien la pantalla no cambiaba y el botón seguía ahí, así que no
 * había forma de distinguir "se envió" de "no pasó nada".
 */
export type ActionState = { error?: string; ok?: boolean; message?: string };

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
    return { ok: true, message: 'Firmaste el acuerdo. Ya podés ver los datos reservados del activo.' };
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
    return {
        ok: true,
        message: `Enviamos tu oferta de ${money({ cents: Math.round(amount * 100), currency: 'USD' })}. La seguís desde Mis compras.`,
    };
}
