'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError } from '@marketplace/api-client';
import type { ReportReasonDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';

export type ActionState = { error?: string };

const MOTIVOS: ReportReasonDto[] = [
    'metricas_falsas',
    'ingreso_falso',
    'activo_no_entregado',
    'activo_recuperado',
    'pago_no_recibido',
    'otro',
];

/**
 * Abre una denuncia. El detalle mínimo lo exige el dominio, pero se valida
 * también acá para no hacer ir y volver un formulario que ya sabemos corto.
 */
export async function fileReport(
    operationId: string,
    _state: ActionState,
    form: FormData,
): Promise<ActionState> {
    const reason = String(form.get('motivo') ?? '');
    const detail = String(form.get('detalle') ?? '').trim();

    if (!MOTIVOS.includes(reason as ReportReasonDto)) {
        return { error: 'Elegí un motivo.' };
    }
    if (detail.length < 20) {
        return { error: 'Contá qué pasó con más detalle: es lo que va a leer la otra parte.' };
    }

    let reportId: string;
    try {
        ({ id: reportId } = await api().denunciar({
            operationId,
            reason: reason as ReportReasonDto,
            detail,
        }));
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos registrar la denuncia.' };
    }

    revalidatePath(`/operaciones/${operationId}`);
    redirect(`/denuncias/${reportId}`);
}

export async function closeReport(
    reportId: string,
    _state: ActionState,
    form: FormData,
): Promise<ActionState> {
    const reason = String(form.get('motivo') ?? '').trim();
    if (reason === '') {
        return { error: 'Indicá por qué cerrás la denuncia.' };
    }

    try {
        await api().cerrarDenuncia(reportId, { reason });
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos cerrar la denuncia.' };
    }

    revalidatePath(`/denuncias/${reportId}`);
    return {};
}
