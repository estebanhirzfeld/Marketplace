import type { TimelineStageDto } from '@marketplace/api-contract';
import { stageCopy } from '@/lib/nextStepCopy';
import { fechaLarga } from '@/lib/format';

/**
 * Las etapas de una venta, iguales para las tres partes: negociación, contrato,
 * custodia, pago, entrega y cierre. La API dice cuál está hecha, cuál en curso
 * y cuándo se cumplió cada una.
 *
 * Una operación cancelada no tiene etapa en curso: se dice arriba y se
 * conservan las que llegaron a cumplirse.
 */
export function Timeline({ stages, cancelled = false }: { stages: TimelineStageDto[]; cancelled?: boolean }) {
    return (
        <div className="flex flex-col gap-5">
            {cancelled && (
                <div className="rounded-[var(--radius-medio)] border border-[var(--color-borde)] p-4">
                    <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">
                        OPERACIÓN CANCELADA
                    </div>
                </div>
            )}
            <ol className="flex flex-col">
                {stages.map((stage, i) => {
                    const hecha = stage.state === 'done';
                    const esActual = stage.state === 'current';
                    const { title, text } = stageCopy(stage.key);

                    return (
                        <li key={stage.key} className="flex gap-4">
                            {/* Riel: punto + línea que conecta con la etapa siguiente */}
                            <div className="flex flex-col items-center">
                                {/*
                                    El tilde dice que la etapa se cumplió sin depender del
                                    color, y el texto para lectores de pantalla lo dice sin
                                    depender de la forma.
                                */}
                                {hecha ? (
                                    <span
                                        className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--color-acento)]/20 text-[11px] font-bold leading-none text-[var(--color-acento)]"
                                        aria-hidden
                                    >
                                        ✓
                                    </span>
                                ) : (
                                    <span
                                        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${
                                            esActual
                                                ? 'border-[var(--color-acento)] bg-[var(--color-acento)] late'
                                                : 'border-[var(--color-borde-fuerte)] bg-transparent'
                                        }`}
                                        aria-hidden
                                    />
                                )}
                                <span className="sr-only">
                                    {hecha ? 'Etapa cumplida' : esActual ? 'Etapa actual' : 'Etapa pendiente'}
                                </span>
                                {i < stages.length - 1 && (
                                    <span
                                        className={`w-px flex-1 ${
                                            hecha ? 'bg-[var(--color-acento)]/40' : 'bg-[var(--color-borde)]'
                                        }`}
                                    />
                                )}
                            </div>

                            <div className={`pb-7 ${esActual ? '' : 'opacity-60'}`}>
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <span className="text-[15px] font-medium">{title}</span>
                                    {stage.key === 'custody' && (
                                        <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-acento)]">
                                            PUNTO DE CONTROL
                                        </span>
                                    )}
                                    {stage.at && (
                                        <span className="text-[12px] text-[var(--color-apagado)]">{fechaLarga(stage.at)}</span>
                                    )}
                                </div>
                                <p className="mt-1 max-w-[440px] text-[13px] leading-relaxed text-[var(--color-tenue)]">
                                    {text}
                                </p>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
