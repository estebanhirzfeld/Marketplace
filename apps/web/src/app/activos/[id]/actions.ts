'use server';

/*
 * Las acciones del vendedor sobre su propio activo. Cada una vuelve a exigir
 * la sesión: una Server Action es un punto de entrada propio, no pasa por la
 * guarda de la pantalla que la muestra.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError } from '@marketplace/api-client';
import { api } from '@/lib/api';
import { requireCounterparty } from '@/lib/guards';
import { parseListingEdit } from '@/lib/listingEdit';
import { isMissingMercadoPagoLink, LINK_MERCADOPAGO } from '@/lib/publishErrors';
import type { ActionState } from '../../vender/actions';

function refresh(listingId: string) {
    revalidatePath('/activos');
    revalidatePath(`/activos/${listingId}`);
}

/** Publica un borrador con la titularidad ya comprobada, sin pasar por revisión. */
export async function publishDraft(listingId: string, _state: ActionState): Promise<ActionState> {
    await requireCounterparty();
    try {
        await api().publishListing(listingId);
    } catch (e) {
        if (e instanceof ApiError) {
            return isMissingMercadoPagoLink(e)
                ? { error: e.message, next: { ...LINK_MERCADOPAGO } }
                : { error: e.message };
        }
        return { error: 'No pudimos publicarlo. Probá de nuevo.' };
    }
    refresh(listingId);
    return { ok: true, message: 'Listo, tu activo ya está en el mercado.' };
}

/** El vendedor avisa que ya invitó a la plataforma; un admin lo confirma después. */
export async function requestAccess(listingId: string, _state: ActionState): Promise<ActionState> {
    await requireCounterparty();
    try {
        await api().requestPlatformAccess(listingId);
    } catch (e) {
        return {
            error: e instanceof ApiError ? e.message : 'No pudimos registrar el aviso. Probá de nuevo.',
        };
    }
    refresh(listingId);
    return { ok: true };
}

/** Edita el borrador (rubro, sin rostro, precio) o cambia el precio de un publicado. */
export async function editListing(
    listingId: string,
    status: string,
    _state: ActionState,
    form: FormData,
): Promise<ActionState> {
    await requireCounterparty();
    const parsed = parseListingEdit(form, status);
    if (!parsed.ok) return { error: parsed.error };

    try {
        await api().editListing(listingId, parsed.body);
    } catch (e) {
        return {
            error: e instanceof ApiError ? e.message : 'No pudimos guardar los cambios. Probá de nuevo.',
        };
    }
    refresh(listingId);
    return { ok: true, message: 'Guardamos los cambios.' };
}

/** Borra un borrador (o un rechazado) y vuelve al listado. */
export async function discardDraft(listingId: string, _state: ActionState): Promise<ActionState> {
    await requireCounterparty();
    try {
        await api().deleteListing(listingId);
    } catch (e) {
        return {
            error: e instanceof ApiError ? e.message : 'No pudimos borrarlo. Probá de nuevo.',
        };
    }
    revalidatePath('/activos');
    // `redirect` lanza, así que va fuera del `try`.
    redirect('/activos');
}
