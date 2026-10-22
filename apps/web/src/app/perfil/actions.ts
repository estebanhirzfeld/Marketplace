'use server';

/*
 * Igual que el resto de las Server Actions: son un punto de entrada propio y
 * cada una vuelve a exigir la sesión. Vincular una cuenta de cobro es cosa de
 * las partes de una compraventa, así que el admin queda afuera.
 */

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError } from '@marketplace/api-client';
import { api } from '@/lib/api';
import { requireCounterparty } from '@/lib/guards';
import {
    LINK_COOKIE,
    LINK_COOKIE_OPTIONS,
    createLinkAttempt,
    serializeLinkCookie,
} from '@/lib/mercadopagoLink';

/**
 * Manda al vendedor a autorizar su cuenta en Mercado Pago.
 *
 * Genera el `state` y el par PKCE, le pide a la API la dirección (que es la
 * única que conoce el cliente de OAuth) y deja `{ state, verifier }` en una
 * cookie para la vuelta. El verificador nunca viaja en la dirección.
 *
 * `redirect` lanza para cortar la ejecución, así que va fuera del `try`.
 */
export async function startMercadoPagoLink(): Promise<void> {
    await requireCounterparty();

    const attempt = createLinkAttempt();
    let url: string;

    try {
        ({ url } = await api().mercadoPagoAuthorizationUrl({
            state: attempt.state,
            codeChallenge: attempt.challenge,
        }));
    } catch (e) {
        // Sin las credenciales de Mercado Pago la API responde 503: se vuelve
        // al perfil con el motivo en la dirección en vez de romper la pantalla.
        const sinConfigurar = e instanceof ApiError && e.status === 503;
        redirect(`/perfil?mercadopago=${sinConfigurar ? 'no-disponible' : 'error'}`);
    }

    // La cookie se escribe recién con la dirección en la mano: un intento que
    // no salió no deja nada guardado.
    (await cookies()).set(LINK_COOKIE, serializeLinkCookie(attempt), LINK_COOKIE_OPTIONS);

    redirect(url);
}

type UnlinkState = { error?: string; ok?: boolean };

/** Desvincula la cuenta. El perfil se vuelve a leer: queda "sin vincular". */
export async function unlinkMercadoPagoAccount(_state: UnlinkState): Promise<UnlinkState> {
    await requireCounterparty();

    try {
        await api().unlinkMercadoPago();
    } catch {
        return { error: 'No pudimos desvincular tu cuenta. Probá de nuevo.' };
    }

    revalidatePath('/perfil');
    return { ok: true };
}

type BankAccountState = { error?: string; ok?: boolean; message?: string };

/**
 * El vendedor declara dónde cobrar por transferencia en una moneda. Un solo
 * campo para el CBU o el alias: si son solo números, es un CBU.
 */
export async function declareBankAccountAction(
    currency: 'ARS' | 'USD',
    _estado: BankAccountState,
    form: FormData,
): Promise<BankAccountState> {
    await requireCounterparty();

    const raw = String(form.get('destination') ?? '').trim();
    const holder = String(form.get('holder') ?? '').trim();
    const digits = raw.replace(/\s+/g, '');
    const destination = /^\d+$/.test(digits) ? { cbu: digits } : { alias: raw };

    try {
        await api().declareBankAccount({ currency, ...destination, holder });
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos guardar la cuenta. Probá de nuevo.' };
    }

    revalidatePath('/perfil');
    return { ok: true, message: 'Guardamos tu cuenta.' };
}
