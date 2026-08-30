'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError } from '@marketplace/api-client';
import { api } from '@/lib/api';
import { currentActor } from '@/lib/session';

export type ActionState = { error?: string; ok?: boolean };

/**
 * Publicar un activo. El assetData se arma según el tipo: su forma la valida
 * el factory del dominio, no este formulario.
 */
export async function publishListing(
    _estado: ActionState,
    form: FormData,
): Promise<ActionState> {
    if (!(await currentActor())) redirect('/ingresar');

    const assetType = String(form.get('assetType') ?? 'youtube');
    const price = Number(form.get('precio'));

    // Se acota a lo que el formulario ofrece: una moneda cualquiera llegaría
    // hasta Money y de ahí a la comisión, sin que nadie la hubiera decidido.
    const moneda = form.get('moneda') === 'ARS' ? 'ARS' : 'USD';
    const ingreso = Number(form.get('ingreso'));

    if (!Number.isFinite(price) || price <= 0) {
        return { error: 'Ingresá un precio válido.' };
    }

    const assetData: Record<string, unknown> = {
        monthlyRevenueUsdCents: Math.round((ingreso || 0) * 100),
        currency: 'USD',
    };

    // La identidad del activo es lo único que un listing blind reserva. Sin
    // ella tampoco se puede verificar nada contra la API.
    const identidad = String(form.get('identidad') ?? '').trim();

    if (assetType === 'youtube') {
        assetData.subscribers = Number(form.get('metrica') || 0);
        assetData.isMonetized = form.get('monetizado') === 'on';
        assetData.audienceTopCountry = String(form.get('pais') || 'AR');
        assetData.channelUrl = identidad;
    } else if (assetType === 'web') {
        assetData.domainAuthority = Number(form.get('metrica') || 0);
        assetData.domain = identidad;
    } else {
        assetData.followers = Number(form.get('metrica') || 0);
        assetData.engagementRate = Number(form.get('engagement') || 0);
        assetData.platform = assetType;
        assetData.profileUrl = identidad;
    }

    try {
        await api().createListing({
            assetType,
            assetData,
            askingPrice: { cents: Math.round(price * 100), currency: 'USD' },
        });
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos publicar el activo. Probá de nuevo.' };
    }

    revalidatePath('/vender');
    return { ok: true };
}

export async function submitForReview(listingId: string): Promise<void> {
    try {
        await api().submitListing(listingId);
    } catch {
        // El error se ve al recargar: el estado del listing no cambió.
    }
    revalidatePath('/vender');
}

/**
 * Manda al vendedor a autorizar en Google.
 *
 * La dirección la arma la API, que es la única que conoce el cliente de OAuth.
 * `redirect` de Next lanza para cortar la ejecución, así que va fuera del
 * `try`: atraparlo ahí lo confundiría con un error del pedido.
 */
export async function startVerification(
    listingId: string,
    source: 'youtube' | 'adsense',
): Promise<void> {
    let url: string;

    try {
        ({ url } = await api().authorizationUrl(listingId, source));
    } catch {
        // Sin credenciales de Google la API responde 503. Se vuelve a la
        // pantalla con el motivo en la dirección, igual que hace la vuelta del
        // consentimiento, en vez de dejar al vendedor sin respuesta.
        redirect('/vender?verificacion=no-configurada');
    }

    redirect(url);
}
