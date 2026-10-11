'use server';

/*
 * Las Server Actions son un punto de entrada propio: se invocan por HTTP y
 * no pasan por la guarda de la pantalla que las muestra. Los docs de Next
 * piden tratarlas como endpoints públicos, así que cada una vuelve a exigir
 * la sesión. No reemplaza a la API ni al dominio, que validan igual: evita
 * que una llamada sin sesión devuelva un error confuso en vez de redirigir.
 */

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError } from '@marketplace/api-client';
import { api } from '@/lib/api';
import { requireAdmin } from '@/lib/guards';
import {
    ACCESS_STATE_COOKIE,
    ACCESS_STATE_COOKIE_OPTIONS,
    createAccessVerificationState,
} from '@/lib/platformAccessVerification';

export type ActionState = { error?: string };

export async function approveListing(listingId: string, _estado: ActionState): Promise<ActionState> {
    await requireAdmin();
    try {
        await api().approveListing(listingId);
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos aprobar el activo.' };
    }
    revalidatePath('/admin');
    return {};
}

export async function rejectListing(
    listingId: string,
    _estado: ActionState,
    form: FormData,
): Promise<ActionState> {
    await requireAdmin();
    const reason = String(form.get('motivo') ?? '').trim();
    if (reason === '') {
        return { error: 'El motivo es obligatorio: el vendedor tiene que saber qué corregir.' };
    }

    try {
        await api().rejectListing(listingId, reason);
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos rechazar el activo.' };
    }
    revalidatePath('/admin');
    return {};
}

/**
 * Registra el acceso de la plataforma al activo.
 *
 * `<input type="date">` entrega `YYYY-MM-DD`, que `new Date()` interpreta como
 * medianoche UTC. Se normaliza a mediodía para que en Argentina (UTC-3) la
 * fecha elegida no retroceda un día al convertirse.
 */
export async function registerPlatformAccess(
    listingId: string,
    _estado: ActionState,
    form: FormData,
): Promise<ActionState> {
    await requireAdmin();
    const day = String(form.get('accessSince') ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        return { error: 'Elegí la fecha desde la que la plataforma tiene acceso.' };
    }

    const custodyAccountId = String(form.get('custodyAccountId') ?? '').trim();
    if (!custodyAccountId) {
        return { error: 'Elegí la cuenta de custodia que sostiene este activo.' };
    }

    const notes = String(form.get('notes') ?? '').trim();

    try {
        await api().registerPlatformAccess(listingId, {
            accessSince: new Date(`${day}T12:00:00`).toISOString(),
            custodyAccountId,
            notes: notes || undefined,
        });
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos registrar el acceso.' };
    }

    revalidatePath(`/listings/${listingId}`);
    revalidatePath('/listings');
    return {};
}

/** Cuando el vendedor expulsó a la plataforma. Ninguna API nos lo avisa. */
export async function revokePlatformAccess(
    listingId: string,
    _estado: ActionState,
): Promise<ActionState> {
    await requireAdmin();
    try {
        await api().revokePlatformAccess(listingId);
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos borrar la constancia de acceso.' };
    }

    revalidatePath(`/listings/${listingId}`);
    revalidatePath('/listings');
    return {};
}

/**
 * Manda al admin a Google para ingresar con la cuenta de custodia. La cookie
 * con el `state` se escribe recién cuando hay una dirección a la que ir.
 */
export async function startPlatformAccessVerification(listingId: string): Promise<void> {
    await requireAdmin();

    const state = createAccessVerificationState(listingId);
    const back = new URLSearchParams({ activo: listingId });
    let url: string;

    try {
        ({ url } = await api().platformAccessAuthorization(listingId, state));
    } catch (e) {
        if (e instanceof ApiError && e.status === 503) {
            redirect(`/admin?${new URLSearchParams({ acceso: 'no-configurado', ...Object.fromEntries(back) })}`);
        }
        const query = new URLSearchParams({ acceso: 'error', ...Object.fromEntries(back) });
        if (e instanceof ApiError) query.set('detalle', e.message);
        redirect(`/admin?${query}`);
    }

    (await cookies()).set(ACCESS_STATE_COOKIE, state, ACCESS_STATE_COOKIE_OPTIONS);

    redirect(url);
}
