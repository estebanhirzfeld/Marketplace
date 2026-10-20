import type { EditListingRequest } from '@marketplace/api-contract';

export type ParsedEdit = { ok: true; body: EditListingRequest } | { ok: false; error: string };

/**
 * Arma el pedido de edición desde el formulario.
 *
 * Un borrador deja cambiar rubro, «sin rostro» y precio; uno publicado, solo
 * precio y moneda. Se filtra acá además de en la API: el formulario de un
 * publicado ni siquiera ofrece los otros campos, pero la acción es un punto de
 * entrada propio.
 */
export function parseListingEdit(form: FormData, status: string): ParsedEdit {
    const price = Number(form.get('precio'));
    if (!Number.isFinite(price) || price <= 0) {
        return { ok: false, error: 'Ingresá un precio válido.' };
    }

    const askingPrice = {
        cents: Math.round(price * 100),
        currency: form.get('moneda') === 'ARS' ? 'ARS' : 'USD',
    };

    if (status !== 'draft' && status !== 'rejected') {
        return { ok: true, body: { askingPrice } };
    }

    return {
        ok: true,
        body: {
            niche: String(form.get('niche') ?? 'other'),
            hasNoFaceContent: form.get('sinRostro') === 'on',
            askingPrice,
        },
    };
}
