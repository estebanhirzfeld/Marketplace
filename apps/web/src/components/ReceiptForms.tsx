'use client';

import { useActionState } from 'react';
import { Alert, Button } from './ui';
import { REJECTION_CODES, REJECTION_LABEL } from '@/lib/receiptCopy';

type State = { error?: string; ok?: boolean; message?: string };
type FormAction = (state: State, form: FormData) => Promise<State>;

const ACCEPTED = 'application/pdf,image/png,image/jpeg,image/webp';

/**
 * El comprador sube el comprobante de una transferencia. El campo de archivo
 * acepta que lo arrastre encima o que lo elija; no hace falta más.
 */
export function ReceiptUploadForm({ action, replacing = false }: { action: FormAction; replacing?: boolean }) {
    const [state, submit, pending] = useActionState(action, {});

    if (state.ok && state.message) return <Alert tono="listo">{state.message}</Alert>;

    return (
        <form action={submit} className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">{replacing ? 'Subí otro comprobante' : 'Subí el comprobante'}</span>
                <input
                    type="file"
                    name="file"
                    accept={ACCEPTED}
                    required
                    className="rounded-lg border border-dashed border-[var(--color-borde)] p-3 text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-fondo)] file:px-3 file:py-1.5 file:text-[13px]"
                />
                <span className="text-[12px] text-[var(--color-apagado)]">Una captura o un PDF, de hasta 5 MB.</span>
            </label>
            {state.error && <Alert>{state.error}</Alert>}
            <Button type="submit" variant="secundario" disabled={pending}>
                {pending ? 'Subiendo…' : 'Subir el comprobante'}
            </Button>
        </form>
    );
}

/**
 * Quien recibió la plata mira el comprobante y responde: le llegó, o qué
 * sucedió. El motivo se elige; el detalle es opcional, salvo con «otro».
 */
export function ReceiptReviewForm({
    fileHref,
    confirmAction,
    rejectAction,
    confirmText,
}: {
    fileHref: string;
    confirmAction: FormAction;
    rejectAction: FormAction;
    confirmText: string;
}) {
    const [confirmed, confirm, confirming] = useActionState(confirmAction, {});
    const [rejected, reject, rejecting] = useActionState(rejectAction, {});

    const done = (confirmed.ok && confirmed.message) || (rejected.ok && rejected.message);
    if (done) return <Alert tono="listo">{done}</Alert>;

    return (
        <div className="flex flex-col gap-4">
            <a href={fileHref} target="_blank" rel="noopener" className="text-[14px] text-[var(--color-acento)]">
                Ver el comprobante →
            </a>
            <form action={confirm} className="flex flex-col gap-2">
                {confirmed.error && <Alert>{confirmed.error}</Alert>}
                <Button type="submit" disabled={confirming || rejecting}>
                    {confirming ? 'Confirmando…' : confirmText}
                </Button>
            </form>
            <details className="text-[13px]">
                <summary className="cursor-pointer text-[var(--color-tenue)]">No se acreditó</summary>
                <form action={reject} className="mt-3 flex flex-col gap-3">
                    <fieldset className="flex flex-col gap-2">
                        <legend className="mb-1 text-[13px] font-medium">¿Qué sucedió con la transferencia?</legend>
                        {REJECTION_CODES.map((code, i) => (
                            <label key={code} className="flex min-h-[44px] items-center gap-3 text-[14px]">
                                <input type="radio" name="code" value={code} required defaultChecked={i === 0} />
                                {REJECTION_LABEL[code]}
                            </label>
                        ))}
                    </fieldset>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[13px] font-medium">Detalle para el comprador (opcional)</span>
                        <textarea
                            name="detail"
                            rows={2}
                            maxLength={2000}
                            placeholder="Por ejemplo: se acreditaron AR$ 1.400.000."
                            className="rounded-lg border border-[var(--color-borde)] bg-transparent p-2.5 text-[13px] leading-relaxed outline-none placeholder:text-[var(--color-apagado)] focus:border-[var(--color-acento)]"
                        />
                    </label>
                    {rejected.error && <Alert>{rejected.error}</Alert>}
                    <Button type="submit" variant="peligro" disabled={confirming || rejecting}>
                        {rejecting ? 'Rechazando…' : 'Rechazar el comprobante'}
                    </Button>
                </form>
            </details>
        </div>
    );
}
