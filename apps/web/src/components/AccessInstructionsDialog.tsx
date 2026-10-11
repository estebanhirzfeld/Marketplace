'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { HandoverStepDto } from '@marketplace/api-contract';
import { Button, ExternalButtonLink } from './ui';
import { BrandAccountMock, InviteMock } from './GoogleMock';
import { CopyEmailButton } from './CopyEmailButton';
import { WhyPopover } from './WhyPopover';

/**
 * Las líneas de cada paso. El nombre de la cuenta de marca puede no ser el del
 * canal, y «Abrir en Google» cae en la lista de cuentas: por eso el paso 2 lo
 * aclara antes de pedir los permisos.
 */
export const ACCESS_DIALOG_LINES: readonly [readonly string[], readonly string[]] = [
    ['Tocá «Mover canal a una cuenta de marca».', 'Creá una cuenta de marca nueva y confirmá.'],
    [
        'Elegí la cuenta de marca de tu canal (puede tener otro nombre) y tocá «Administrar permisos».',
        'Invitá a esta dirección con el rol Administrador.',
    ],
];

/**
 * Los dos pasos para darnos acceso, en un diálogo con una maqueta animada de
 * Google al costado. Es YouTube a propósito: la maqueta y los textos son de ese
 * flujo, así que lo monta solo quien tiene los dos pasos guiados.
 *
 * Es un `<dialog>` nativo con `showModal()`: atrapa el foco, cierra con Esc y el
 * foco vuelve a quien lo abrió. `openAt` lo abre en un paso y `onClose` avisa
 * que se cerró, así el dueño del estado sabe que puede volver a abrirlo.
 *
 * «Ya lo hice» del primer paso es del navegador (`onBrandAccountDone`);
 * «Ya los invité» del segundo es el aviso real a la plataforma.
 */
export function AccessInstructionsDialog({
    steps,
    email,
    openAt,
    onClose,
    onBrandAccountDone,
    requestAction,
    pending,
    error,
    requested,
}: {
    steps: HandoverStepDto[];
    email: string;
    /** Paso donde abrir (0 o 1), o `null` si está cerrado. */
    openAt: 0 | 1 | null;
    onClose: () => void;
    onBrandAccountDone: () => void;
    /** Acción del formulario «Ya los invité». */
    requestAction: () => void;
    pending: boolean;
    error?: string;
    /** El aviso ya se mandó: se muestra «Estamos revisando tu invitación». */
    requested: boolean;
}) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const [index, setIndex] = useState<0 | 1>(0);
    const [why, setWhy] = useState(false);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (openAt === null || !dialog || dialog.open) return;
        setIndex(openAt);
        setWhy(false);
        dialog.showModal();
    }, [openAt]);

    const step = steps[index];
    const link = step?.links?.at(-1);
    const checking = requested;

    return (
        <dialog
            ref={dialogRef}
            aria-labelledby={titleId}
            onClose={onClose}
            onClick={(e) => {
                if (e.target === dialogRef.current) dialogRef.current?.close();
            }}
            className="m-auto w-[min(980px,calc(100vw-2rem))] max-h-[92vh] overflow-y-auto rounded-[var(--radius-grande)] border border-[var(--color-borde-fuerte)] bg-[var(--color-superficie)] p-0 text-[var(--color-tinta)] backdrop:bg-black/70"
        >
            <header className="flex items-center justify-between border-b border-[var(--color-borde)] py-3 pl-6 pr-4">
                <div className="flex items-center gap-4">
                    <span className="text-[15px] font-medium">Danos acceso de administrador</span>
                    <span className="font-mono text-[12px] text-[var(--color-apagado)]">
                        {checking ? 'Listo' : `${index + 1} / 2`}
                    </span>
                </div>
                <button
                    type="button"
                    aria-label="Cerrar"
                    onClick={() => dialogRef.current?.close()}
                    className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-chico)] text-[var(--color-tenue)] hover:text-[var(--color-tinta)]"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                </button>
            </header>

            {checking ? (
                <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 p-6 text-center">
                    <svg className="girando" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--color-acento)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <path d="M12 3a9 9 0 1 0 9 9" />
                    </svg>
                    <span id={titleId} className="text-[22px] font-bold">Estamos revisando tu invitación</span>
                    <span className="max-w-[420px] text-[15px] leading-relaxed text-[var(--color-tenue)]">
                        Suele llevar menos de un día. Te avisamos cuando quede confirmada.
                    </span>
                </div>
            ) : (
                <div className="grid min-h-[440px] md:grid-cols-[380px_minmax(0,1fr)]">
                    <div className="flex flex-col gap-4 px-6 py-7">
                        <h3 id={titleId} className="text-[24px] font-bold leading-tight">
                            {step?.title ?? 'Danos acceso'}
                        </h3>
                        <ol className="flex flex-col gap-3 text-[15px] leading-relaxed text-[#c4c8cd]">
                            {ACCESS_DIALOG_LINES[index].map((text, i) => (
                                <li key={text} className="flex gap-3">
                                    <span className="font-mono text-[13px] text-[var(--color-apagado)]">{i + 1}.</span>
                                    {text}
                                </li>
                            ))}
                        </ol>
                        {index === 1 && (
                            <CopyEmailButton email={email} />
                        )}
                        {link && (
                            <ExternalButtonLink href={link.href} variant="primario" className="self-start px-4 py-2.5">
                                {index === 0 ? 'Abrir en YouTube' : 'Abrir en Google'}
                                <span aria-hidden="true">↗</span>
                            </ExternalButtonLink>
                        )}
                        <div className="relative mt-auto self-start pt-2">
                            <button
                                type="button"
                                aria-expanded={why}
                                onClick={() => setWhy((v) => !v)}
                                className="min-h-11 text-[14px] text-[var(--color-tenue)] underline underline-offset-[3px] hover:text-[var(--color-tinta)]"
                            >
                                ¿Por qué te pedimos esto?
                            </button>
                            {why && <WhyPopover step={index} />}
                        </div>
                    </div>
                    <div className="hidden items-center justify-center border-l border-[var(--color-borde)] bg-[var(--color-fondo)]/60 p-6 md:flex">
                        {index === 0 ? <BrandAccountMock /> : <InviteMock email={email} />}
                    </div>
                </div>
            )}

            <footer className="flex items-center justify-between gap-3 border-t border-[var(--color-borde)] px-6 py-3.5">
                {checking ? (
                    <span />
                ) : (
                    <Button
                        type="button"
                        variant="secundario"
                        disabled={index === 0}
                        onClick={() => setIndex(0)}
                    >
                        ← Anterior
                    </Button>
                )}
                <div className="flex items-center gap-3">
                    {error && <span className="text-[13px] text-[var(--color-error)]">{error}</span>}
                    {checking ? (
                        <Button type="button" onClick={() => dialogRef.current?.close()}>
                            Cerrar
                        </Button>
                    ) : index === 0 ? (
                        <Button
                            type="button"
                            onClick={() => {
                                onBrandAccountDone();
                                setIndex(1);
                                setWhy(false);
                            }}
                        >
                            Ya lo hice →
                        </Button>
                    ) : (
                        <form action={requestAction}>
                            <Button type="submit" disabled={pending}>
                                {pending ? 'Un momento…' : 'Ya los invité'}
                            </Button>
                        </form>
                    )}
                </div>
            </footer>
        </dialog>
    );
}
