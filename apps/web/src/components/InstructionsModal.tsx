'use client';

import { useId, useRef, useState } from 'react';
import type { HandoverStepDto } from '@marketplace/api-contract';
import { Button, ExternalButtonLink } from './ui';

/** "Paso 2 de 4". El índice llega base 0. */
export function stepCounter(index: number, total: number): string {
    return `Paso ${index + 1} de ${total}`;
}

/** Mueve el paso actual sin salirse de la lista. */
export function moveStep(index: number, delta: -1 | 1, total: number): number {
    return Math.min(Math.max(index + delta, 0), total - 1);
}

/**
 * Las instrucciones del vendedor, un paso por pantalla.
 *
 * Reemplaza a una pared de texto: cada paso tiene un título, viñetas cortas y
 * botones con enlaces directos a la pantalla de Google o YouTube donde se hace.
 * El contenido sale del dominio —cada tipo de activo escribe sus pasos—, así
 * que acá no hay ningún texto de YouTube: solo se dibuja lo que llega.
 *
 * Usa el elemento nativo `<dialog>` con `showModal()`: deja el resto de la
 * página inerte, atrapa el foco, cierra con Esc y devuelve el foco a quien lo
 * abrió. El foco se devuelve a mano también, por si el navegador no lo hace.
 *
 * Solo muestra los pasos que traen detalle: con una lista sin ninguno (un sitio
 * web) no dibuja nada y quien lo monta conserva su texto.
 */
export function InstructionsModal({
    steps,
    title = 'Cómo darnos acceso',
    triggerLabel = 'Ver cómo hacerlo',
}: {
    steps: HandoverStepDto[];
    title?: string;
    triggerLabel?: string;
}) {
    const withDetail = steps.filter((s) => s.details && s.details.length > 0);
    const [index, setIndex] = useState(0);
    const dialogRef = useRef<HTMLDialogElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const titleId = useId();

    if (withDetail.length === 0) return null;

    const total = withDetail.length;
    const step = withDetail[Math.min(index, total - 1)];

    function open() {
        setIndex(0);
        dialogRef.current?.showModal();
    }

    return (
        <>
            <Button
                ref={triggerRef}
                type="button"
                variant="secundario"
                onClick={open}
                className="self-start px-4 py-2 text-[13px]"
            >
                {triggerLabel}
            </Button>

            <dialog
                ref={dialogRef}
                aria-modal="true"
                aria-labelledby={titleId}
                // Esc y `close()` terminan acá: se devuelve el foco a quien abrió.
                onClose={() => triggerRef.current?.focus()}
                // Un clic en el fondo (el propio <dialog>, no su contenido) lo cierra.
                onClick={(e) => {
                    if (e.target === dialogRef.current) dialogRef.current?.close();
                }}
                className="m-auto max-h-[85vh] w-[min(560px,calc(100vw-2rem))] overflow-y-auto rounded-[var(--radius-medio)] border border-[var(--color-borde-fuerte)] bg-[var(--color-superficie)] p-0 text-[var(--color-tinta)] backdrop:bg-black/60"
            >
                <div className="flex flex-col gap-5 p-6">
                    <div className="flex items-start justify-between gap-4">
                        <h2 id={titleId} className="text-[18px] font-bold tracking-[-0.02em]">
                            {title}
                        </h2>
                        <Button
                            type="button"
                            variant="fantasma"
                            onClick={() => dialogRef.current?.close()}
                            className="px-3 py-1.5 text-[13px]"
                        >
                            Cerrar
                        </Button>
                    </div>

                    <div aria-live="polite" className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-acento)]">
                                {stepCounter(index, total)}
                            </span>
                            {step.afterPlatformStarts && (
                                <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">
                                    Más adelante, con el contrato firmado
                                </span>
                            )}
                            <h3 className="text-[16px] font-bold">{step.title ?? step.description}</h3>
                        </div>

                        <ul className="flex flex-col gap-2">
                            {step.details?.map((detail) => (
                                <li
                                    key={detail}
                                    className="flex items-start gap-2.5 text-[14px] leading-relaxed text-[var(--color-tenue)]"
                                >
                                    <span aria-hidden="true" className="text-[var(--color-acento)]">
                                        •
                                    </span>
                                    {detail}
                                </li>
                            ))}
                        </ul>

                        {step.links && step.links.length > 0 && (
                            <div className="flex flex-wrap gap-2.5">
                                {step.links.map((link) => (
                                    <ExternalButtonLink
                                        key={link.href + link.label}
                                        href={link.href}
                                        className="px-4 py-2 text-[13px]"
                                    >
                                        {link.label}
                                    </ExternalButtonLink>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between gap-3 border-t border-[var(--color-borde)] pt-4">
                        <Button
                            type="button"
                            variant="fantasma"
                            disabled={index === 0}
                            onClick={() => setIndex((i) => moveStep(i, -1, total))}
                            className="px-4 py-2 text-[13px]"
                        >
                            Anterior
                        </Button>
                        <Button
                            type="button"
                            disabled={index >= total - 1}
                            onClick={() => setIndex((i) => moveStep(i, 1, total))}
                            className="px-4 py-2 text-[13px]"
                        >
                            Siguiente
                        </Button>
                    </div>
                </div>
            </dialog>
        </>
    );
}
