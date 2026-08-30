'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError } from '@marketplace/api-client';
import { api } from '@/lib/api';
import { actorActual } from '@/lib/sesion';

export type EstadoAccion = { error?: string; ok?: boolean };

/**
 * Publicar un activo. El assetData se arma según el tipo: su forma la valida
 * el factory del dominio, no este formulario.
 */
export async function publicar(
    _estado: EstadoAccion,
    datos: FormData,
): Promise<EstadoAccion> {
    if (!(await actorActual())) redirect('/ingresar');

    const assetType = String(datos.get('assetType') ?? 'youtube');
    const precio = Number(datos.get('precio'));
    const ingreso = Number(datos.get('ingreso'));

    if (!Number.isFinite(precio) || precio <= 0) {
        return { error: 'Ingresá un precio válido.' };
    }

    const assetData: Record<string, unknown> = {
        monthlyRevenueUsdCents: Math.round((ingreso || 0) * 100),
        currency: 'USD',
    };

    if (assetType === 'youtube') {
        assetData.subscribers = Number(datos.get('metrica') || 0);
        assetData.isMonetized = datos.get('monetizado') === 'on';
        assetData.audienceTopCountry = String(datos.get('pais') || 'AR');
    } else if (assetType === 'web') {
        assetData.domainAuthority = Number(datos.get('metrica') || 0);
    } else {
        assetData.followers = Number(datos.get('metrica') || 0);
        assetData.engagementRate = Number(datos.get('engagement') || 0);
        assetData.platform = assetType;
    }

    try {
        await api().createListing({
            assetType,
            assetData,
            askingPrice: { cents: Math.round(precio * 100), currency: 'USD' },
            isBlind: datos.get('blind') === 'on',
        });
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos publicar el activo. Probá de nuevo.' };
    }

    revalidatePath('/vender');
    return { ok: true };
}

export async function enviarARevision(listingId: string): Promise<void> {
    try {
        await api().submitListing(listingId);
    } catch {
        // El error se ve al recargar: el estado del listing no cambió.
    }
    revalidatePath('/vender');
}
