'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export async function marcarLeido(id: string): Promise<void> {
    try {
        await api().marcarAvisoLeido(id);
    } catch {
        // Si falla, el aviso simplemente sigue sin leer.
    }
    // El contador de la campana vive en el layout.
    revalidatePath('/', 'layout');
}
