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
import type { DomainOwnershipChallengeDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { currentActor } from '@/lib/session';
import { requireCounterparty } from '@/lib/guards';
import { isMissingMercadoPagoLink } from '@/lib/publishErrors';
import {
    YOUTUBE_STATE_COOKIE,
    YOUTUBE_STATE_COOKIE_OPTIONS,
    createConnectionState,
} from '@/lib/youtubeConnection';

/** Ver el comentario en `listings/[id]/actions.ts`: el éxito también se cuenta. */
export type ActionState = {
    error?: string;
    ok?: boolean;
    message?: string;
    /** Un camino hacia donde se resuelve el error, cuando existe uno. */
    next?: { href: string; label: string };
};

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
        // El nombre es parte del blindaje, igual que la dirección: con él se
        // encuentra el activo buscándolo. Lo ven el vendedor, la plataforma y
        // el comprador que firmó el acuerdo.
        name: String(form.get('nombre') ?? '').trim(),
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

    let listingId: string;

    try {
        const created = await api().createListing({
            assetType,
            assetData,
            // La moneda es la que el vendedor eligió. Estaba fija en 'USD':
            // se podía elegir pesos en el formulario y el activo se publicaba
            // igual en dólares, con el precio multiplicado por la cotización.
            askingPrice: { cents: Math.round(price * 100), currency: moneda },
        });
        listingId = created.id;
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos publicar el activo. Probá de nuevo.' };
    }

    revalidatePath('/activos');
    // Al borrador creado, donde está lo que falta para enviarlo a revisión.
    // `redirect` lanza, así que va fuera del `try`.
    redirect(`/activos/${listingId}`);
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

/**
 * Manda el activo a la cola de revisión.
 *
 * Devolvía `void` y se tragaba el error con un comentario que decía que se
 * vería al recargar. No se veía: el activo seguía en borrador y la pantalla no
 * daba ninguna señal. El motivo más común es justamente uno que hay que
 * explicar —falta verificar la titularidad, falta el KYC— así que esconderlo
 * dejaba al vendedor sin saber qué le falta.
 */
export async function submitForReview(
    listingId: string,
    _estado: ActionState,
): Promise<ActionState> {
    await requireCounterparty();
    try {
        await api().submitListing(listingId);
    } catch (e) {
        if (e instanceof ApiError) {
            // El mensaje de la API ya explica qué falta; acá se suma a dónde ir.
            return isMissingMercadoPagoLink(e)
                ? { error: e.message, next: { href: '/perfil#mercadopago', label: 'Vincular Mercado Pago' } }
                : { error: e.message };
        }
        return { error: 'No pudimos enviarlo a revisión. Probá de nuevo.' };
    }

    revalidatePath('/activos');
    revalidatePath(`/activos/${listingId}`);
    return { ok: true, message: 'Lo enviamos a revisión. Te avisamos cuando salga al mercado.' };
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
        // Sin credenciales de Google la API responde 503. Se vuelve al activo
        // del que salió —no a la pantalla de publicar, que ya no muestra este
        // aviso— con el motivo en la dirección, igual que hace la vuelta del
        // consentimiento.
        redirect(`/activos/${listingId}?ver=verificaciones&verificacion=no-configurada`);
    }

    redirect(url);
}

/** Cómo termina una consulta del TXT: `verified: false` sin error es «todavía no está». */
export type DomainCheckState = { verified?: boolean; error?: string };

const DNS_NOT_AVAILABLE =
    'La comprobación por DNS todavía no está disponible. Probá más tarde o comprobalo con AdSense.';
const DNS_GENERIC_ERROR = 'No pudimos consultar tu DNS. Probá de nuevo.';

/** El 503 de la API es «sin secreto configurado»; el resto se muestra como viene. */
function dnsErrorMessage(e: unknown): string {
    if (e instanceof ApiError) return e.status === 503 ? DNS_NOT_AVAILABLE : e.message;
    return DNS_GENERIC_ERROR;
}

/**
 * El registro TXT que el vendedor tiene que cargar en el DNS de su dominio.
 *
 * Lo pide el diálogo cuando se abre y no la página: resolver los servidores de
 * nombres es una consulta de red, y no tiene sentido pagarla en cada visita al
 * activo si casi nadie abre el diálogo. Devuelve el error en vez de lanzar:
 * el diálogo lo muestra en su lugar.
 */
export async function getDomainOwnershipChallenge(
    listingId: string,
): Promise<{ challenge?: DomainOwnershipChallengeDto; error?: string }> {
    await requireCounterparty();
    try {
        return { challenge: await api().domainOwnershipChallenge(listingId) };
    } catch (e) {
        return { error: dnsErrorMessage(e) };
    }
}

/**
 * Pregunta si el TXT ya está en el DNS. Se llama a repetición mientras el
 * diálogo está abierto, así que «todavía no» es una respuesta normal, no un
 * error. Solo un resultado positivo invalida la pantalla del activo.
 */
export async function checkDomainOwnership(
    listingId: string,
    _state: DomainCheckState,
): Promise<DomainCheckState> {
    await requireCounterparty();
    try {
        const { verified } = await api().verifyDomainOwnership(listingId);
        if (verified) revalidatePath(`/activos/${listingId}`);
        return { verified };
    } catch (e) {
        return { verified: false, error: dnsErrorMessage(e) };
    }
}

/**
 * Manda al vendedor a autorizar su canal en Google.
 *
 * Genera el `state`, le pide la dirección a la API (la única que conoce el
 * cliente de OAuth) y lo deja en una cookie para la vuelta. La cookie se
 * escribe recién con la dirección en la mano: un intento que no salió no deja
 * nada guardado. `redirect` lanza, así que va fuera del `try`.
 */
export async function startYouTubeConnection(): Promise<void> {
    await requireCounterparty();

    const state = createConnectionState();
    let url: string;

    try {
        ({ url } = await api().youTubeAuthorizationUrl({ state }));
    } catch (e) {
        // Sin las credenciales de Google la API responde 503: `/vender` pasa a
        // la carga manual, que existe solo para ese caso.
        const notConfigured = e instanceof ApiError && e.status === 503;
        redirect(`/vender?conexion=${notConfigured ? 'no-configurada' : 'no-disponible'}`);
    }

    (await cookies()).set(YOUTUBE_STATE_COOKIE, state, YOUTUBE_STATE_COOKIE_OPTIONS);

    redirect(url);
}

/**
 * Crea el borrador desde un canal conectado y lleva al vendedor a él.
 *
 * Suscriptores, vistas, ingresos y país salen de la lectura de Google que
 * guarda la API: acá solo viaja lo que Google no sabe.
 */
export async function createYouTubeListing(
    channelId: string,
    _state: ActionState,
    form: FormData,
): Promise<ActionState> {
    await requireCounterparty();

    const price = Number(form.get('precio'));
    if (!Number.isFinite(price) || price <= 0) {
        return { error: 'Ingresá un precio válido.' };
    }

    let listingId: string;

    try {
        const created = await api().createListingFromYouTubeConnection(channelId, {
            niche: String(form.get('niche') ?? 'other'),
            hasNoFaceContent: form.get('sinRostro') === 'on',
            askingPrice: {
                cents: Math.round(price * 100),
                currency: form.get('moneda') === 'ARS' ? 'ARS' : 'USD',
            },
        });
        listingId = created.listingId;
    } catch (e) {
        if (e instanceof ApiError) {
            // La API manda `listingId` solo cuando el canal ya publicado es del
            // propio vendedor: ahí hay adónde llevarlo.
            if (e.status === 409 && e.listingId) {
                return {
                    error: 'Ese canal ya lo publicaste.',
                    next: { href: `/activos/${e.listingId}`, label: 'Ver el activo' },
                };
            }
            return { error: e.message };
        }
        return { error: 'No pudimos publicar el canal. Probá de nuevo.' };
    }

    revalidatePath('/activos');
    redirect(`/activos/${listingId}`);
}
