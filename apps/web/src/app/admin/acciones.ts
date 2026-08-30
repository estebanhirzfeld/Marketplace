'use server';

import { revalidatePath } from 'next/cache';
import { ApiError } from '@marketplace/api-client';
import { api } from '@/lib/api';

export type EstadoAccion = { error?: string };

export async function aprobar(listingId: string, _estado: EstadoAccion): Promise<EstadoAccion> {
    try {
        await api().approveListing(listingId);
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos aprobar el activo.' };
    }
    revalidatePath('/admin');
    return {};
}

export async function rechazar(
    listingId: string,
    _estado: EstadoAccion,
    datos: FormData,
): Promise<EstadoAccion> {
    const motivo = String(datos.get('motivo') ?? '').trim();
    if (motivo === '') {
        return { error: 'El motivo es obligatorio: el vendedor tiene que saber qué corregir.' };
    }

    try {
        await api().rejectListing(listingId, motivo);
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos rechazar el activo.' };
    }
    revalidatePath('/admin');
    return {};
}
