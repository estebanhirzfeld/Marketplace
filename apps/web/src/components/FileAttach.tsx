'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { Alert } from './ui';
import { SubmitButton } from './SubmitButton';

type State = { error?: string; ok?: boolean; message?: string };
export type FileAction = (state: State, form: FormData) => Promise<State>;

/**
 * Adjuntar un archivo del banco —un comprobante, los movimientos de una
 * cuenta—, verlo antes de enviarlo y saber que se está enviando. Un solo botón:
 * el teléfono ya ofrece la galería o la cámara.
 */
export function FileAttach({
    action,
    attachText = 'Adjuntar comprobante',
    submitText = 'Enviar comprobante',
    pendingText = 'Enviando el comprobante…',
    checkText = 'Verificá que el monto y la fecha sean legibles.',
}: {
    action: FileAction;
    attachText?: string;
    submitText?: string;
    pendingText?: string;
    /** Qué revisar en la vista previa antes de enviar. */
    checkText?: string;
}) {
    const id = useId();
    const [state, submit] = useActionState(action, {});
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const previewRef = useRef<string | null>(null);

    // La vista previa vive lo que vive el archivo elegido: se libera al cambiarlo y al salir.
    useEffect(
        () => () => {
            if (previewRef.current) URL.revokeObjectURL(previewRef.current);
        },
        [],
    );

    function choose(next: File | null) {
        if (previewRef.current) URL.revokeObjectURL(previewRef.current);
        const url = next && next.type.startsWith('image/') ? URL.createObjectURL(next) : null;
        previewRef.current = url;
        setPreview(url);
        setFile(next);
    }

    if (state.ok && state.message) return <Alert tono="listo">{state.message}</Alert>;

    return (
        <form action={submit} className="flex flex-col gap-3">
            <input
                id={id}
                type="file"
                name="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                required
                className="sr-only"
                onChange={(e) => choose(e.target.files?.[0] ?? null)}
            />
            {!file ? (
                <div className="flex flex-wrap items-center gap-4">
                    <label
                        htmlFor={id}
                        className="inline-flex min-h-[48px] cursor-pointer items-center rounded-[var(--radius-chico)] bg-[var(--color-acento)] px-5 text-[15px] font-bold text-[var(--color-fondo)]"
                    >
                        {attachText}
                    </label>
                    <span className="text-[13px] text-[var(--color-apagado)]">Una captura o un PDF, de hasta 5 MB.</span>
                </div>
            ) : (
                <div className="flex items-center gap-4 rounded-[var(--radius-chico)] border border-[var(--color-borde)] p-3">
                    {preview ? (
                        // Una vista previa local del archivo elegido: no pasa por next/image.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={preview} alt="Vista previa del archivo" className="h-24 w-[72px] flex-none rounded-sm object-cover" />
                    ) : (
                        <span className="flex h-24 w-[72px] flex-none items-center justify-center rounded-sm bg-[var(--color-fondo)] font-mono text-[12px] text-[var(--color-tenue)]">
                            PDF
                        </span>
                    )}
                    <span className="flex min-w-0 flex-col gap-1">
                        <span className="truncate text-[15px]">{file.name}</span>
                        <span className="text-[13px] text-[var(--color-apagado)]">{checkText}</span>
                        <label htmlFor={id} className="min-h-[44px] cursor-pointer self-start py-2 text-[14px] text-[var(--color-acento)]">
                            Cambiar el archivo
                        </label>
                    </span>
                </div>
            )}
            {state.error && <Alert>{state.error}</Alert>}
            {file && (
                <SubmitButton className="self-start" pendingText={pendingText}>
                    {submitText}
                </SubmitButton>
            )}
        </form>
    );
}
