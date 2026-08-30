'use server';

import { revalidatePath } from 'next/cache';
import { ApiError } from '@marketplace/api-client';
import { api } from '@/lib/api';

export type EstadoAccion = { error?: string };

type Paso = 'accept' | 'cancel' | 'transfer' | 'custody' | 'payment' | 'complete';

const EJECUTAR: Record<Paso, (id: string) => Promise<void>> = {
    accept: (id) => api().acceptOffer(id),
    cancel: (id) => api().cancelOperation(id),
    transfer: (id) => api().initiateTransfer(id),
    custody: (id) => api().confirmCustody(id),
    payment: (id) => api().confirmPayment(id),
    complete: (id) => api().completeOperation(id),
};

/**
 * Un solo punto de entrada para los pasos sin parámetros. La autorización de
 * cada uno vive en su use case: acá no se decide nada.
 */
export async function avanzar(
    operationId: string,
    paso: Paso,
    _estado: EstadoAccion,
): Promise<EstadoAccion> {
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

export async function contraofertar(
    operationId: string,
    _estado: EstadoAccion,
    datos: FormData,
): Promise<EstadoAccion> {
    const pesos = Number(datos.get('monto'));
    if (!Number.isFinite(pesos) || pesos <= 0) {
        return { error: 'Ingresá un monto válido.' };
    }

    try {
        await api().counterOffer(operationId, {
            price: { cents: Math.round(pesos * 100), currency: 'USD' },
        });
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos registrar la contraoferta.' };
    }

    revalidatePath(`/operaciones/${operationId}`);
    return {};
}

export async function firmarContrato(
    operationId: string,
    contractId: string,
    _estado: EstadoAccion,
): Promise<EstadoAccion> {
    try {
        await api().signContract(contractId);
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos firmar el contrato.' };
    }

    revalidatePath(`/operaciones/${operationId}`);
    return {};
}
