'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError } from '@marketplace/api-client';
import { api } from '@/lib/api';
import { actorActual } from '@/lib/sesion';

export type EstadoAccion = { error?: string };

export async function firmarNda(
    listingId: string,
    _estado: EstadoAccion,
): Promise<EstadoAccion> {
    if (!(await actorActual())) redirect('/ingresar');

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

export async function ofertar(
    listingId: string,
    _estado: EstadoAccion,
    datos: FormData,
): Promise<EstadoAccion> {
    if (!(await actorActual())) redirect('/ingresar');

    const pesos = Number(datos.get('monto'));
    if (!Number.isFinite(pesos) || pesos <= 0) {
        return { error: 'Ingresá un monto válido.' };
    }

    try {
        await api().createOffer(listingId, {
            offerPrice: { cents: Math.round(pesos * 100), currency: 'USD' },
        });
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos registrar la oferta. Probá de nuevo.' };
    }

    revalidatePath(`/listings/${listingId}`);
    return {};
}
