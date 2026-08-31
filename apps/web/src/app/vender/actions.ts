'use server';

/*
 * Las Server Actions son un punto de entrada propio: se invocan por HTTP y
 * no pasan por la guarda de la pantalla que las muestra. Los docs de Next
 * piden tratarlas como endpoints públicos, así que cada una vuelve a exigir
 * la sesión. No reemplaza a la API ni al dominio, que validan igual: evita
 * que una llamada sin sesión devuelva un error confuso en vez de redirigir.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError } from '@marketplace/api-client';
import { api } from '@/lib/api';
import { currentActor } from '@/lib/session';
import { requireCounterparty } from '@/lib/guards';

export type ActionState = { error?: string; ok?: boolean };

/**
 * Publicar un activo. El assetData se arma según el tipo: su forma la valida
 * el factory del dominio, no este formulario.
 */
export async function publishListing(
    _estado: ActionState,
    form: FormData,
): Promise<ActionState> {
    await requireCounterparty();

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
        // El rubro vale para los dos tipos y lo valida el factory contra la
        // lista cerrada, así que acá se reenvía tal cual llega.
        niche: String(form.get('niche') ?? 'other'),
    };

    // La identidad del activo es lo único que un listing blind reserva. Sin
    // ella tampoco se puede verificar nada contra la API.
    const identidad = String(form.get('identidad') ?? '').trim();

    if (assetType === 'youtube') {
        assetData.subscribers = Number(form.get('metrica') || 0);
        assetData.isMonetized = form.get('monetizado') === 'on';
        assetData.audienceTopCountry = String(form.get('pais') || 'AR');
        assetData.channelUrl = identidad;
    } else {
        assetData.domainAuthority = Number(form.get('metrica') || 0);
        assetData.domain = identidad;
    }

    try {
        await api().createListing({
            assetType,
            assetData,
            // La moneda es la que el vendedor eligió. Estaba fija en 'USD':
            // se podía elegir pesos en el formulario y el activo se publicaba
            // igual en dólares, con el precio multiplicado por la cotización.
            askingPrice: { cents: Math.round(price * 100), currency: moneda },
        });
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos publicar el activo. Probá de nuevo.' };
    }

    revalidatePath('/vender');
    return { ok: true };
}

/**
 * La valuación que calcula la fórmula del activo, mientras se completa el
 * formulario.
 *
 * Va por la API y no se recalcula en el navegador a propósito: la fórmula vive
 * en la strategy del dominio y tenerla en dos lados garantiza que en algún
 * momento digan cosas distintas. Devuelve `null` en vez de propagar el error
 * porque el formulario está incompleto casi todo el tiempo que se lo escribe,
 * y un cartel rojo por cada tecla sería ruido.
 */
export async function estimateListingPrice(
    assetType: string,
    assetData: Record<string, unknown>,
): Promise<{ cents: number; currency: string } | null> {
    if (!(await currentActor())) return null;

    try {
        const { estimatedPrice } = await api().estimateListingPrice({ assetType, assetData });
        return estimatedPrice;
    } catch {
        return null;
    }
}

export async function submitForReview(listingId: string): Promise<void> {
    await requireCounterparty();
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
    await requireCounterparty();
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
