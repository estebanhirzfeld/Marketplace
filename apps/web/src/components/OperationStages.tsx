import type { TimelineStageDto } from '@marketplace/api-contract';
import { stageLabel } from '@/lib/nextStepCopy';
import { fechaSinAnioActual } from '@/lib/format';

/** Cuánto espera cada etapa hecha para llenarse después de la anterior. */
const STAGGER_MS = 220;
/** Lo que dura el trazo: la actual empieza a latir cuando terminó de llenarse. */
const DRAW_MS = 700;

interface StageView {
    key: TimelineStageDto['key'];
    state: TimelineStageDto['state'];
    label: string;
    when: string;
    delay: string;
}

/**
 * Las seis etapas de una operación en una línea, con sus fechas: arriba de la
 * página, iguales para las tres partes. La API dice cuál está hecha, cuál en
 * curso y cuándo se cumplió cada una; la fecha de la actual es el plazo de
 * quien mira.
 *
 * En el teléfono la línea pasa a una barra con «Etapa N de 6 · …» y la lista
 * completa plegada debajo.
 */
export function OperationStages({
    stages,
    assetType,
    currentDeadline,
    cancelled = false,
    now = new Date(),
}: {
    stages: TimelineStageDto[];
    assetType?: string;
    /** El plazo de quien mira para la etapa actual, si lo tiene. */
    currentDeadline?: string;
    cancelled?: boolean;
    /** Para decidir si la fecha lleva el año. */
    now?: Date;
}) {
    if (stages.length === 0) return null;

    const views: StageView[] = stages.map((stage, i) => {
        const state = cancelled && stage.state === 'current' ? 'pending' : stage.state;
        return {
            key: stage.key,
            state,
            label: stageLabel(stage.key, assetType),
            when:
                state === 'done' && stage.at
                    ? fechaSinAnioActual(stage.at, now)
                    : state === 'current' && currentDeadline
                      ? `Hasta el ${fechaSinAnioActual(currentDeadline, now)}`
                      : '',
            delay: state === 'current' ? `${i * STAGGER_MS}ms, ${i * STAGGER_MS + DRAW_MS}ms` : `${i * STAGGER_MS}ms`,
        };
    });

    const currentIndex = views.findIndex((v) => v.state === 'current');
    const lastDone = views.reduce((last, v, i) => (v.state === 'done' ? i : last), -1);
    const shownIndex = currentIndex >= 0 ? currentIndex : Math.max(lastDone, 0);

    return (
        <div>
            {/* Escritorio: una línea con las seis etapas. */}
            <ol aria-label="Etapas de la operación" className="hidden grid-cols-6 gap-2 md:grid">
                {views.map((v) => (
                    <li
                        key={v.key}
                        aria-current={v.state === 'current' ? 'step' : undefined}
                        className="relative flex flex-col gap-2.5 pt-3.5"
                    >
                        <StageBar view={v} />
                        <span
                            className={`text-[15px] ${
                                v.state === 'current'
                                    ? 'font-bold text-[var(--color-tinta)]'
                                    : v.state === 'done'
                                      ? 'text-[var(--color-tenue)]'
                                      : 'text-[var(--color-apagado)]'
                            }`}
                        >
                            {v.label}
                        </span>
                        <span className="text-[13px] text-[var(--color-apagado)]">{v.when}</span>
                    </li>
                ))}
            </ol>

            {/* Teléfono: la barra y la etapa en la que está; la lista, plegada. */}
            <details className="md:hidden">
                <summary className="flex min-h-11 cursor-pointer list-none flex-col gap-2.5">
                    <div
                        role="progressbar"
                        aria-label="Etapa de la operación"
                        aria-valuemin={1}
                        aria-valuemax={views.length}
                        aria-valuenow={shownIndex + 1}
                        className="grid grid-cols-6 gap-1"
                    >
                        {views.map((v) => (
                            <span key={v.key} className="relative h-1 rounded-sm bg-[var(--color-borde-fuerte)]">
                                {v.state !== 'pending' && (
                                    <span
                                        aria-hidden
                                        className={v.state === 'current' ? 'etapa-actual' : 'etapa'}
                                        style={{
                                            position: 'absolute',
                                            inset: 0,
                                            borderRadius: 2,
                                            background: 'var(--color-acento)',
                                            animationDelay: v.delay,
                                        }}
                                    />
                                )}
                            </span>
                        ))}
                    </div>
                    <span className="flex justify-between gap-3 text-[14px]">
                        {cancelled ? (
                            <span className="font-bold">Operación cancelada</span>
                        ) : (
                            <span>
                                Etapa {shownIndex + 1} de {views.length} · <strong className="font-bold">{views[shownIndex]?.label}</strong>
                            </span>
                        )}
                        <span className="text-[var(--color-acento)]">Ver todas</span>
                    </span>
                </summary>
                <ol
                    aria-label="Todas las etapas"
                    className="mt-2 flex flex-col border-t border-[var(--color-borde-fuerte)] text-[15px]"
                >
                    {views.map((v) => (
                        <li
                            key={v.key}
                            className={`flex justify-between gap-3 py-2.5 ${
                                v.state === 'current'
                                    ? 'font-bold'
                                    : v.state === 'done'
                                      ? 'text-[var(--color-tenue)]'
                                      : 'text-[var(--color-apagado)]'
                            }`}
                        >
                            <span>{v.label}</span>
                            {v.when && <span className={v.state === 'current' ? '' : 'text-[var(--color-apagado)]'}>{v.when}</span>}
                        </li>
                    ))}
                </ol>
            </details>

            {cancelled && <p className="mt-4 hidden text-[14px] font-bold md:block">Operación cancelada</p>}
        </div>
    );
}

/** El trazo de una etapa: el riel apagado y, encima, el acento que se llena. */
function StageBar({ view }: { view: StageView }) {
    return (
        <>
            <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] rounded-sm bg-[var(--color-borde-fuerte)]" />
            {view.state !== 'pending' && (
                <span
                    aria-hidden
                    className={view.state === 'current' ? 'etapa-actual' : 'etapa'}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 3,
                        borderRadius: 2,
                        background: 'var(--color-acento)',
                        animationDelay: view.delay,
                    }}
                />
            )}
        </>
    );
}
