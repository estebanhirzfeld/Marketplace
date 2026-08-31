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
import { requireSession } from '@/lib/guards';

export type ActionState = { error?: string };

type Step = 'accept' | 'cancel' | 'transfer' | 'complete';

const EJECUTAR: Record<Step, (id: string) => Promise<void>> = {
    accept: (id) => api().acceptOffer(id),
    cancel: (id) => api().cancelOperation(id),
    transfer: (id) => api().initiateTransfer(id),
    complete: (id) => api().completeOperation(id),
};

/**
 * Un solo punto de entrada para los pasos sin parámetros. La autorización de
 * cada uno vive en su use case: acá no se decide nada.
 */
export async function advanceOperation(
    operationId: string,
    paso: Step,
    _estado: ActionState,
): Promise<ActionState> {
    await requireSession();
    try {
        await EJECUTAR[paso](operationId);
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos completar la acción. Probá de nuevo.' };
    }

    revalidatePath(`/operaciones/${operationId}`);
    revalidatePath('/operaciones');
    return {};
}

export async function counterOffer(
    operationId: string,
    _estado: ActionState,
    form: FormData,
): Promise<ActionState> {
    await requireSession();
    const amount = Number(form.get('money'));
    if (!Number.isFinite(amount) || amount <= 0) {
        return { error: 'Ingresá un monto válido.' };
    }

    try {
        await api().counterOffer(operationId, {
            price: { cents: Math.round(amount * 100), currency: 'USD' },
        });
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos registrar la contraoferta.' };
    }

    revalidatePath(`/operaciones/${operationId}`);
    return {};
}

export async function signContract(
    operationId: string,
    contractId: string,
    _estado: ActionState,
): Promise<ActionState> {
    await requireSession();
    try {
        await api().signContract(contractId);
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos firmar el contrato.' };
    }

    revalidatePath(`/operaciones/${operationId}`);
    return {};
}

/**
 * Las métricas se cargan como texto libre porque cada activo tiene las suyas:
 * suscriptores en un canal, visitas en un sitio. Una línea por dato.
 */
function parseMetrics(text: string): Record<string, number> | null {
    const metrics: Record<string, number> = {};

    for (const linea of text.split('\n')) {
        const limpia = linea.trim();
        if (!limpia) continue;

        const corte = limpia.indexOf(':');
        if (corte < 1) return null;

        const name = limpia.slice(0, corte).trim();
        const value = Number(limpia.slice(corte + 1).replace(/[\s._]/g, ''));
        if (!name || !Number.isFinite(value)) return null;

        metrics[name] = value;
    }

    return metrics;
}

/**
 * Registra la verificación de la custodia. Las dos casillas viajan tal cual el
 * admin las dejó: es el dominio el que decide si con eso alcanza, no esta capa.
 */
export async function confirmCustody(
    operationId: string,
    _estado: ActionState,
    form: FormData,
): Promise<ActionState> {
    await requireSession();
    const metrics = parseMetrics(String(form.get('metrics') ?? ''));
    if (!metrics) {
        return { error: 'Revisá las métricas: una por línea, con el formato nombre: número.' };
    }

    const notes = String(form.get('notes') ?? '').trim();

    try {
        await api().confirmCustody(operationId, {
            isPrimaryOwner: form.get('isPrimaryOwner') === 'on',
            accessSecured: form.get('accessSecured') === 'on',
            metrics,
            notes: notes || undefined,
        });
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos registrar la custodia.' };
    }

    revalidatePath(`/operaciones/${operationId}`);
    return {};
}


/**
 * Manda al comprador a pagar.
 *
 * El link lo arma la API contra MercadoPago; `redirect` de Next lanza para
 * cortar la ejecución, así que va fuera del `try`.
 */
export async function goToCheckout(operationId: string): Promise<void> {
    await requireSession();
    let url: string;

    try {
        ({ url } = await api().checkout(operationId));
    } catch {
        redirect(`/operaciones/${operationId}?pago=no-disponible`);
    }

    redirect(url);
}

/**
 * Registra una transferencia bancaria. Los pagos de MercadoPago no pasan por
 * acá: los confirma el webhook contra la propia pasarela.
 */
export async function confirmBankTransfer(
    operationId: string,
    amountCents: number,
    currency: string,
): Promise<void> {
    await requireSession();
    try {
        await api().confirmPayment(operationId, {
            method: 'transferencia_bancaria',
            amountCents,
            currency,
        });
    } catch {
        // El error se ve al recargar: el estado de la operación no cambió.
    }

    revalidatePath(`/operaciones/${operationId}`);
}
