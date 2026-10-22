'use client';

import { useActionState, useState } from 'react';
import { Alert, Button } from './ui';
import { REJECTION_CODES, REJECTION_LABEL } from '@/lib/receiptCopy';

type State = { error?: string; ok?: boolean; message?: string };
type FormAction = (state: State, form: FormData) => Promise<State>;

/**
 * Quien recibió la plata mira el comprobante y responde: se acreditó, o qué
 * sucedió. El motivo se elige; el detalle es opcional, salvo con «otro».
 * Confirmar no se deshace, así que el monto esperado y la cuenta van a la vista.
 */
export function ReceiptReviewForm({
    fileHref,
    isImage = false,
    expected,
    account,
    confirmAction,
    rejectAction,
    confirmText,
}: {
    fileHref: string;
    /** Con una imagen se muestra la vista previa; un PDF se abre aparte. */
    isImage?: boolean;
    /** Lo que se tuvo que acreditar, ya escrito: «AR$ 1.425.000». */
    expected?: string;
    /** La cuenta donde se tuvo que acreditar. */
    account?: string;
    confirmAction: FormAction;
    rejectAction: FormAction;
    confirmText: string;
}) {
    const [confirmed, confirm, confirming] = useActionState(confirmAction, {});
    const [rejected, reject, rejecting] = useActionState(rejectAction, {});
    const [rejectingOpen, setRejectingOpen] = useState(false);

    const done = (confirmed.ok && confirmed.message) || (rejected.ok && rejected.message);
    if (done) return <Alert tono="listo">{done}</Alert>;

    if (confirming || rejecting) {
        return (
            <div aria-busy="true" className="flex min-h-[48px] items-center gap-3 text-[15px]">
                <Spinner />
                {confirming ? 'Registrando tu confirmación…' : 'Registrando el rechazo…'}
            </div>
        );
    }

    if (rejectingOpen) {
        return (
            <form action={reject} className="flex flex-col gap-4">
                <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-[15px] font-medium">¿Qué sucedió con la transferencia?</legend>
                    {REJECTION_CODES.map((code, i) => (
                        <label key={code} className="flex min-h-[44px] items-center gap-3 text-[15px]">
                            <input type="radio" name="code" value={code} required defaultChecked={i === 0} />
                            {REJECTION_LABEL[code]}
                        </label>
                    ))}
                </fieldset>
                <label className="flex flex-col gap-1.5">
                    <span className="text-[14px] text-[var(--color-tenue)]">Detalle para el comprador (opcional)</span>
                    <textarea
                        name="detail"
                        rows={2}
                        maxLength={2000}
                        placeholder="Por ejemplo: se acreditaron AR$ 1.400.000."
                        className="rounded-lg border border-[var(--color-borde)] bg-transparent p-2.5 text-[14px] leading-relaxed outline-none placeholder:text-[var(--color-apagado)] focus:border-[var(--color-acento)]"
                    />
                </label>
                <p className="text-[13px] leading-relaxed text-[var(--color-apagado)]">
                    <strong className="text-[var(--color-tinta)]">El comprador</strong> recibirá el motivo y deberá adjuntar un nuevo
                    comprobante.
                </p>
                {rejected.error && <Alert>{rejected.error}</Alert>}
                <div className="flex flex-wrap gap-3">
                    <Button type="submit" variant="peligro">
                        Rechazar el comprobante
                    </Button>
                    <button type="button" onClick={() => setRejectingOpen(false)} className="min-h-[44px] px-2 text-[14px] text-[var(--color-tenue)]">
                        Volver
                    </button>
                </div>
            </form>
        );
    }

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start gap-5">
                {isImage && (
                    <a href={fileHref} target="_blank" rel="noopener" aria-label="Ver el comprobante completo" className="flex-none">
                        {/* El archivo lo sirve la propia web con la sesión: no pasa por next/image. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={fileHref} alt="Comprobante del comprador" className="h-[200px] w-[150px] rounded-[var(--radius-chico)] object-cover" />
                    </a>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                        Verificá en tu banco que se hayan acreditado{' '}
                        {expected && <strong className="text-[var(--color-tinta)]">{expected}</strong>}
                        {account && (
                            <>
                                {' '}en la cuenta <strong className="text-[var(--color-tinta)]">{account}</strong>
                            </>
                        )}
                        . Una vez confirmado, no se puede deshacer.
                    </p>
                    <a href={fileHref} target="_blank" rel="noopener" className="inline-flex min-h-[44px] items-center text-[14px] text-[var(--color-acento)]">
                        Ver el comprobante completo
                    </a>
                </div>
            </div>
            {confirmed.error && <Alert>{confirmed.error}</Alert>}
            <div className="flex flex-wrap gap-3">
                <form action={confirm}>
                    <Button type="submit">{confirmText}</Button>
                </form>
                <Button type="button" variant="secundario" onClick={() => setRejectingOpen(true)}>
                    No se acreditó
                </Button>
            </div>
        </div>
    );
}

function Spinner() {
    return (
        <span
            aria-hidden="true"
            className="size-5 animate-spin rounded-full border-2 border-[var(--color-borde-fuerte)] border-t-[var(--color-acento)] motion-reduce:animate-none"
        />
    );
}
