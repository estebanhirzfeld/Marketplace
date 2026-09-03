'use server';

/*
 * Server Actions del ABM de cuentas de custodia. Como el resto de las acciones
 * del panel, cada una vuelve a exigir la sesión de admin: se invocan por HTTP
 * y no pasan por la guarda de la pantalla. El dominio valida igual.
 */

import { revalidatePath } from 'next/cache';
import { ApiError } from '@marketplace/api-client';
import type { AssetTypeDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { requireAdmin } from '@/lib/guards';

export type ActionState = { error?: string; ok?: boolean };

const TIPOS: AssetTypeDto[] = ['youtube', 'web'];

function leerTipo(form: FormData): AssetTypeDto | undefined {
    const raw = String(form.get('assetType') ?? '').trim();
    return TIPOS.includes(raw as AssetTypeDto) ? (raw as AssetTypeDto) : undefined;
}

export async function createCustodyAccount(
    _estado: ActionState,
    form: FormData,
): Promise<ActionState> {
    await requireAdmin();

    const label = String(form.get('label') ?? '').trim();
    const identifier = String(form.get('identifier') ?? '').trim();
    const assetType = leerTipo(form);
    const notes = String(form.get('notes') ?? '').trim();

    if (!label) return { error: 'Poné una etiqueta para reconocer la cuenta.' };
    if (!identifier) return { error: 'Poné el identificador que el vendedor va a invitar.' };
    if (!assetType) return { error: 'Elegí el tipo de activo de la cuenta.' };

    try {
        await api().createCustodyAccount({ label, identifier, assetType, notes: notes || undefined });
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos crear la cuenta.' };
    }

    revalidatePath('/admin/cuentas');
    return { ok: true };
}

export async function updateCustodyAccount(
    id: string,
    _estado: ActionState,
    form: FormData,
): Promise<ActionState> {
    await requireAdmin();

    const label = String(form.get('label') ?? '').trim();
    const identifier = String(form.get('identifier') ?? '').trim();
    const assetType = leerTipo(form);
    const notes = String(form.get('notes') ?? '').trim();

    try {
        await api().updateCustodyAccount(id, {
            label: label || undefined,
            identifier: identifier || undefined,
            assetType,
            notes: notes || undefined,
        });
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos guardar los cambios.' };
    }

    revalidatePath('/admin/cuentas');
    return { ok: true };
}

export async function setCustodyAccountActive(
    id: string,
    activa: boolean,
    _estado: ActionState,
): Promise<ActionState> {
    await requireAdmin();

    try {
        if (activa) await api().activateCustodyAccount(id);
        else await api().deactivateCustodyAccount(id);
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: activa ? 'No pudimos reactivar la cuenta.' : 'No pudimos dar de baja la cuenta.' };
    }

    revalidatePath('/admin/cuentas');
    return { ok: true };
}
