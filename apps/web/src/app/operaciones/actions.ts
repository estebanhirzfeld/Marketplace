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
import { money } from '@/lib/format';
import { REJECTION_CODES } from '@/lib/receiptCopy';
import type { ReceiptRejectionCodeDto } from '@marketplace/api-contract';

/** Ver el comentario en `listings/[id]/actions.ts`: el éxito también se cuenta. */
export type ActionState = { error?: string; ok?: boolean; message?: string };

type Step = 'accept' | 'cancel';

const EJECUTAR: Record<Step, (id: string) => Promise<void>> = {
    accept: (id) => api().acceptOffer(id),
    cancel: (id) => api().cancelOperation(id),
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
    return paso === 'accept'
        ? {
              ok: true,
              message:
                  'Aceptaste la oferta. Se cancelaron las demás sobre este activo y ahora falta firmar el contrato.',
          }
        : {};
}

/**
 * El comprador declara dónde quiere recibir el activo.
 *
 * Es una tarea pendiente suya: puede resolverla desde que hay contrato y es
 * inevitable recién al cerrar. La autorización —que sea el comprador— la hace
 * el dominio; acá solo se valida que el identificador no venga vacío.
 */
export async function declareRecipientIdentity(
    operationId: string,
    _estado: ActionState,
    form: FormData,
): Promise<ActionState> {
    await requireSession();
    const identifier = String(form.get('identifier') ?? '').trim();
    if (!identifier) {
        return { error: 'Indicá la cuenta donde querés recibir el activo.' };
    }

    try {
        await api().declareRecipientIdentity(operationId, { identifier });
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos registrar tu cuenta receptora.' };
    }

    revalidatePath(`/operaciones/${operationId}`);
    return { ok: true, message: 'Registramos dónde querés recibir el activo.' };
}

/**
 * El vendedor declara haber cedido el control del activo.
 *
 * Es la única transición del escrow que la plataforma no puede ejecutar: la
 * hace el vendedor en la plataforma del activo. Acá solo se valida que
 * afirme la cesión; el dominio rechaza una declaración negativa.
 */
export async function initiateTransfer(
    operationId: string,
    _estado: ActionState,
    form: FormData,
): Promise<ActionState> {
    await requireSession();
    const controlCeded = form.get('controlCeded') === 'on';
    if (!controlCeded) {
        return { error: 'Tenés que confirmar que ya cediste el control del activo.' };
    }

    const notes = String(form.get('notes') ?? '').trim();
    const sellerSourceIdentity = String(form.get('sellerSourceIdentity') ?? '').trim();

    try {
        await api().initiateTransfer(operationId, {
            controlCeded,
            notes: notes || undefined,
            sellerSourceIdentity: sellerSourceIdentity || undefined,
        });
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos registrar la declaración. Probá de nuevo.' };
    }

    revalidatePath(`/operaciones/${operationId}`);
    revalidatePath('/operaciones');
    return { ok: true, message: 'Declaraste la cesión. Ahora verificamos el activo y confirmamos la custodia.' };
}

/**
 * Cierra la operación: registra la constancia de entrega y transiciona a
 * completada, en un solo acto. `deliveredToIdentifier` no viaja: lo copia el
 * dominio de la identidad que el comprador declaró, para no entregar a un
 * destino que nunca eligió.
 */
export async function completeOperation(
    operationId: string,
    _estado: ActionState,
    form: FormData,
): Promise<ActionState> {
    await requireSession();

    try {
        await api().completeOperation(operationId, {
            buyerIsPrimaryOwner: form.get('buyerIsPrimaryOwner') === 'on',
            accessTransferred: form.get('accessTransferred') === 'on',
            sellerRemoved: form.get('sellerRemoved') === 'on',
            notes: String(form.get('notes') ?? '').trim() || undefined,
        });
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos cerrar la operación.' };
    }

    revalidatePath(`/operaciones/${operationId}`);
    revalidatePath('/operaciones');
    return { ok: true, message: 'Cerramos la operación. El comprador tiene el activo y el vendedor cobró su parte.' };
}

/**
 * La moneda llega ligada desde la página: es la de la negociación. Si alguien
 * la cambiara, el dominio rechaza una contraoferta en otra moneda.
 */
export async function counterOffer(
    operationId: string,
    currency: string,
    _estado: ActionState,
    form: FormData,
): Promise<ActionState> {
    await requireSession();
    const amount = Number(form.get('money'));
    if (!Number.isFinite(amount) || amount <= 0) {
        return { error: 'Ingresá un monto válido.' };
    }

    const price = { cents: Math.round(amount * 100), currency };
    try {
        await api().counterOffer(operationId, { price });
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos registrar la contraoferta.' };
    }

    revalidatePath(`/operaciones/${operationId}`);
    return {
        ok: true,
        message: `Propusiste ${money(price)}. Ahora le toca responder a la otra parte.`,
    };
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
    return {
        ok: true,
        message: 'Firmaste el contrato. Cuando firme la otra parte, la operación avanza sola.',
    };
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

/** Lo mismo que acepta la API: más grande no llega a subirse. */
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

const RECEIPT_RECIPIENTS = ['seller', 'platform'] as const;
type ReceiptRecipient = (typeof RECEIPT_RECIPIENTS)[number];

/**
 * El comprador sube el comprobante de una de las dos transferencias. Qué
 * formato es lo decide la API por el contenido, no por el nombre del archivo.
 */
export async function uploadReceiptAction(
    operationId: string,
    recipient: ReceiptRecipient,
    _estado: ActionState,
    form: FormData,
): Promise<ActionState> {
    await requireSession();
    if (!RECEIPT_RECIPIENTS.includes(recipient)) return { error: 'No reconocemos ese comprobante.' };

    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) {
        return { error: 'Elegí el comprobante: una imagen o un PDF.' };
    }
    if (file.size > MAX_RECEIPT_BYTES) {
        return { error: 'El comprobante pesa más de 5 MB. Subí una captura o un PDF más liviano.' };
    }

    try {
        await api().uploadReceipt(operationId, recipient, new Uint8Array(await file.arrayBuffer()));
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos subir el comprobante. Probá de nuevo.' };
    }

    revalidatePath(`/operaciones/${operationId}`);
    return {
        ok: true,
        message:
            recipient === 'seller'
                ? 'Recibimos el comprobante. El vendedor confirma que le llegó y te avisamos.'
                : 'Recibimos el comprobante. Confirmamos que llegó la comisión y te avisamos.',
    };
}

/**
 * Quien recibió la plata confirma su comprobante o lo rechaza eligiendo un
 * motivo, que es lo que va a leer el comprador para corregirlo.
 */
export async function decideReceiptAction(
    operationId: string,
    recipient: ReceiptRecipient,
    confirm: boolean,
    _estado: ActionState,
    form: FormData,
): Promise<ActionState> {
    await requireSession();
    if (!RECEIPT_RECIPIENTS.includes(recipient)) return { error: 'No reconocemos ese comprobante.' };

    const code = String(form.get('code') ?? '') as ReceiptRejectionCodeDto;
    const detail = String(form.get('detail') ?? '').trim() || undefined;
    if (!confirm && !REJECTION_CODES.includes(code)) {
        return { error: 'Elegí qué sucedió con la transferencia.' };
    }

    try {
        await api().decideReceipt(operationId, recipient, confirm ? { confirm: true } : { confirm: false, code, detail });
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos guardar la respuesta. Probá de nuevo.' };
    }

    revalidatePath(`/operaciones/${operationId}`);
    if (!confirm) {
        return { ok: true, message: 'Rechazaste el comprobante. El comprador recibirá el motivo y deberá adjuntar uno nuevo.' };
    }
    return {
        ok: true,
        message:
            recipient === 'seller'
                ? 'Registramos tu confirmación. Le avisaremos al comprador que recibiste el pago.'
                : 'Registramos la acreditación de la comisión. Le avisaremos al comprador.',
    };
}

/* ── Revisión de un comprobante rechazado ───────────────────*/

/** Corre un paso de la revisión y devuelve cómo quedó, con el mensaje para quien lo hizo. */
async function reviewStep(operationId: string, run: () => Promise<void>, message: string): Promise<ActionState> {
    await requireSession();
    try {
        await run();
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos registrar la decisión. Probá de nuevo.' };
    }
    revalidatePath(`/operaciones/${operationId}`);
    return { ok: true, message };
}

/** El comprador pide la revisión de un comprobante rechazado, con el ID COELSA si lo tiene. */
export async function requestReceiptReviewAction(
    operationId: string,
    recipient: ReceiptRecipient,
    _estado: ActionState,
    form: FormData,
): Promise<ActionState> {
    if (!RECEIPT_RECIPIENTS.includes(recipient)) return { error: 'No reconocemos ese comprobante.' };
    const bankReference = String(form.get('bankReference') ?? '').trim() || undefined;
    return reviewStep(
        operationId,
        () => api().requestReceiptReview(operationId, recipient, { bankReference }),
        'Solicitaste la revisión. La revisión es manual y puede demorar: te avisaremos cuando se resuelva.',
    );
}

/** El comprador suma el ID COELSA a una revisión abierta. */
export async function addReviewBankReferenceAction(
    operationId: string,
    recipient: ReceiptRecipient,
    _estado: ActionState,
    form: FormData,
): Promise<ActionState> {
    if (!RECEIPT_RECIPIENTS.includes(recipient)) return { error: 'No reconocemos ese comprobante.' };
    const bankReference = String(form.get('bankReference') ?? '').trim();
    if (!bankReference) return { error: 'Decinos el ID COELSA o el número de operación.' };
    return reviewStep(
        operationId,
        () => api().addReviewBankReference(operationId, recipient, bankReference),
        'Agregamos el dato a la revisión.',
    );
}

/** El admin revisó la coherencia: coherente pide el rastreo; si no, se rechaza con el motivo. */
export async function resolveReceiptCoherenceAction(
    operationId: string,
    recipient: ReceiptRecipient,
    coherent: boolean,
    _estado: ActionState,
    form: FormData,
): Promise<ActionState> {
    if (!RECEIPT_RECIPIENTS.includes(recipient)) return { error: 'No reconocemos ese comprobante.' };
    const reason = String(form.get('reason') ?? '').trim();
    if (!coherent && !reason) return { error: 'Escribí por qué el comprobante no es coherente: lo leerá el comprador.' };
    return reviewStep(
        operationId,
        () => api().resolveReceiptCoherence(operationId, recipient, coherent ? { coherent: true } : { coherent: false, reason }),
        coherent
            ? 'Registramos la coherencia. Le avisaremos al vendedor que tiene su plazo para responder.'
            : 'Rechazaste el comprobante. El comprador recibirá el motivo.',
    );
}

/** El admin resolvió con el rastreo bancario si el pago se acreditó. */
export async function resolveReceiptReviewAction(
    operationId: string,
    recipient: ReceiptRecipient,
    credited: boolean,
    _estado: ActionState,
): Promise<ActionState> {
    if (!RECEIPT_RECIPIENTS.includes(recipient)) return { error: 'No reconocemos ese comprobante.' };
    return reviewStep(
        operationId,
        () => api().resolveReceiptReview(operationId, recipient, { credited }),
        'Registramos la resolución. Le avisaremos al comprador y al vendedor.',
    );
}

/** El vendedor adjunta los movimientos de su cuenta a la revisión. */
export async function attachSellerStatementAction(
    operationId: string,
    _estado: ActionState,
    form: FormData,
): Promise<ActionState> {
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return { error: 'Elegí los movimientos: una imagen o un PDF.' };
    if (file.size > MAX_RECEIPT_BYTES) return { error: 'El archivo pesa más de 5 MB. Adjuntá una captura o un PDF más liviano.' };
    const bytes = new Uint8Array(await file.arrayBuffer());
    return reviewStep(
        operationId,
        () => api().attachSellerStatement(operationId, bytes),
        'Recibimos los movimientos. La revisión es manual y puede demorar: te avisaremos cuando se resuelva.',
    );
}

/* ── Traspaso de un sitio (admin) ─────────────────────────*/

type StepStatus = 'pending' | 'waiting' | 'done' | 'expired' | 'rejected';

/** Corre una acción del traspaso y le cuenta al admin cómo quedó el paso. */
async function domainStep(
    operationId: string,
    run: () => Promise<{ status: StepStatus }>,
    messages: Partial<Record<StepStatus, string>>,
    fallback: string,
): Promise<ActionState> {
    await requireSession();
    let status: StepStatus;
    try {
        ({ status } = await run());
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: fallback };
    }

    revalidatePath(`/operaciones/${operationId}`);
    return { ok: true, message: messages[status] ?? 'Listo.' };
}

export async function checkDomainCustodyAction(operationId: string, _estado: ActionState): Promise<ActionState> {
    return domainStep(
        operationId,
        () => api().checkDomainCustody(operationId),
        {
            pending: 'Todavía no hay un traslado hacia nuestra cuenta de Hostinger.',
            waiting: 'El traslado llegó y lo aceptamos. Falta confirmarlo desde el mail de Hostinger.',
            done: 'El dominio ya está en nuestra cuenta y la custodia quedó confirmada.',
            expired: 'La invitación del vendedor venció. Tiene que iniciar el traslado de nuevo.',
        },
        'No pudimos comprobar el dominio. Probá de nuevo.',
    );
}

export async function deliverDomainAction(operationId: string, _estado: ActionState): Promise<ActionState> {
    return domainStep(
        operationId,
        () => api().deliverDomain(operationId),
        {
            waiting: 'Le mandamos la invitación al comprador. Tiene 10 días para aceptarla.',
            done: 'El dominio ya está en la cuenta del comprador.',
        },
        'No pudimos iniciar la entrega. Probá de nuevo.',
    );
}

export async function checkDomainDeliveryAction(operationId: string, _estado: ActionState): Promise<ActionState> {
    return domainStep(
        operationId,
        () => api().checkDomainDelivery(operationId),
        {
            pending: 'La entrega todavía no empezó.',
            waiting: 'El comprador todavía no aceptó la invitación.',
            done: 'El dominio ya está en la cuenta del comprador. Ya se puede cerrar la operación.',
            expired: 'La invitación al comprador venció. Hay que iniciar la entrega de nuevo.',
        },
        'No pudimos comprobar la entrega. Probá de nuevo.',
    );
}

/**
 * El admin rechaza la declaración de cesión del vendedor. La operación vuelve a
 * «contrato firmado» y el vendedor lee el motivo en la operación.
 */
export async function rejectTransferAction(
    operationId: string,
    _estado: ActionState,
    form: FormData,
): Promise<ActionState> {
    await requireSession();
    const reason = String(form.get('reason') ?? '').trim();
    if (!reason) {
        return { error: 'Escribí el motivo: es lo que va a leer el vendedor.' };
    }

    try {
        await api().rejectTransfer(operationId, { reason });
    } catch (e) {
        if (e instanceof ApiError) return { error: e.message };
        return { error: 'No pudimos rechazar la cesión. Probá de nuevo.' };
    }

    revalidatePath(`/operaciones/${operationId}`);
    return { ok: true, message: 'Rechazaste la cesión. El vendedor ve el motivo y puede volver a declararla.' };
}

export async function attestTransferStepAction(
    operationId: string,
    stepKey: string,
    _estado: ActionState,
): Promise<ActionState> {
    return domainStep(
        operationId,
        () => api().attestTransferStep(operationId, stepKey),
        { done: 'Paso dado por cumplido.' },
        'No pudimos dar el paso por cumplido. Probá de nuevo.',
    );
}

/** Un paso de la entrega de un canal: la invitación, su aceptación, la propiedad principal y la recepción. */
export type DeliveryStepId = 'invited' | 'accepted' | 'owner' | 'received';

const DELIVERY_STEP_DONE: Record<DeliveryStepId, string> = {
    invited: 'Registramos la invitación. Te avisaremos cuando el comprador la acepte.',
    accepted: 'Registramos tu aceptación. Te avisaremos cuando seas propietario principal.',
    owner: 'Registramos la entrega. Le avisaremos al comprador para que confirme la recepción.',
    received: 'Registramos la recepción. La operación se cerrará y te avisaremos.',
};

export async function deliveryStepAction(operationId: string, step: DeliveryStepId, _estado: ActionState, _form: FormData): Promise<ActionState> {
    if (!(step in DELIVERY_STEP_DONE)) return { error: 'No reconocemos ese paso.' };
    const run = {
        invited: () => api().markBuyerInvited(operationId),
        accepted: () => api().acceptInvitation(operationId),
        owner: () => api().makeBuyerOwner(operationId),
        received: () => api().confirmAssetReceipt(operationId),
    }[step];
    return reviewStep(operationId, run, DELIVERY_STEP_DONE[step]);
}
