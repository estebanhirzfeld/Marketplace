'use server';

/*
 * Las Server Actions son un punto de entrada propio: se invocan por HTTP y
 * no pasan por la guarda de la pantalla que las muestra. Los docs de Next
 * piden tratarlas como endpoints públicos, así que cada una vuelve a exigir
 * la sesión. No reemplaza a la API ni al dominio, que validan igual: evita
 * que una llamada sin sesión devuelva un error confuso en vez de redirigir.
 */

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/guards';

export async function markAsRead(id: string): Promise<void> {
    await requireSession();
    try {
        await api().marcarAvisoLeido(id);
    } catch {
        // Si falla, el aviso simplemente sigue sin leer.
    }
    // El contador de la campana vive en el layout.
    revalidatePath('/', 'layout');
}
