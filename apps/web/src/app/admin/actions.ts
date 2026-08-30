'use server';

import { revalidatePath } from 'next/cache';
import { ApiError } from '@marketplace/api-client';
import { api } from '@/lib/api';

export type ActionState = { error?: string };

export async function approveListing(listingId: string, _estado: ActionState): Promise<ActionState> {
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
    const day = String(form.get('accessSince') ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        return { error: 'Elegí la fecha desde la que la plataforma tiene acceso.' };
    }

    const notes = String(form.get('notes') ?? '').trim();

    try {
        await api().registerPlatformAccess(listingId, {
            accessSince: new Date(`${day}T12:00:00`).toISOString(),
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
