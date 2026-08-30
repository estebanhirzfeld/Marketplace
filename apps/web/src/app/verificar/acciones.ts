'use server';

import { revalidatePath } from 'next/cache';
import { ApiError } from '@marketplace/api-client';
import { api } from '@/lib/api';

export type EstadoAccion = { error?: string; ok?: boolean };

export async function verificar(
    _estado: EstadoAccion,
    datos: FormData,
): Promise<EstadoAccion> {
    const dni = String(datos.get('dni') ?? '');
    const phone = String(datos.get('phone') ?? '').trim() || undefined;
    const country = String(datos.get('country') ?? '').trim() || undefined;

    try {
        await api().verificarIdentidad({ dni, phone, country });
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos verificar tu identidad. Probá de nuevo.' };
    }

    // El estado de KYC afecta el aviso del layout y los gates de todas las
    // pantallas: hay que invalidar todo, no solo esta ruta.
    revalidatePath('/', 'layout');
    return { ok: true };
}
