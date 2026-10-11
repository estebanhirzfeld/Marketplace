'use client';

import { useActionState, useState, useSyncExternalStore } from 'react';
import type { HandoverStepDto, PlatformAccessStatusDto } from '@marketplace/api-contract';
import type { ActionState } from '@/app/vender/actions';
import { readBrandAccountDone, writeBrandAccountDone, type KeyValueStorage } from '@/lib/accessProgress';
import { Alert, Button, CheckIcon } from './ui';
import { AccessStatusPanel } from './AccessStatusPanel';
import { AccessInstructionsDialog } from './AccessInstructionsDialog';

type Action = (state: ActionState) => Promise<ActionState>;

function storage(): KeyValueStorage | null {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

// El paso 1 lo recuerda el navegador. `useSyncExternalStore` evita el desajuste
// de hidratación: el servidor siempre dice «no hecho» y el cliente corrige.
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
    listeners.add(cb);
    return () => void listeners.delete(cb);
}

/**
 * El acceso de la plataforma, en el orden en que se hace.
 *
 * Los dos pasos de antes de la venta se destraban de a uno: primero pasar el
 * canal a una cuenta de marca (lo tilda el propio vendedor, solo en su
 * navegador), después invitarnos (esto sí le avisa a la plataforma). Una vez
 * avisado, el panel pasa a mostrar en qué va: verificando, cuenta regresiva o
 * inmediata. Los pasos de la operación no están acá: se piden con la venta.
 *
 * `guided` activa el diálogo con la maqueta de Google, que es de YouTube; sin
 * él los pasos se leen como texto.
 */
export function AccessPanel({
    listingId,
    steps,
    email,
    status,
    transferableFrom,
    guided,
    now,
    requestAction,
}: {
    listingId: string;
    steps: HandoverStepDto[];
    email?: string;
    status: PlatformAccessStatusDto;
    transferableFrom?: string;
    guided: boolean;
    now: string;
    requestAction: Action;
}) {
    const [state, submit, pending] = useActionState(requestAction, {});
    const [openAt, setOpenAt] = useState<0 | 1 | null>(null);
    const [doneHere, setDoneHere] = useState(false);
    const stored = useSyncExternalStore(
        subscribe,
        () => readBrandAccountDone(storage(), listingId),
        () => false,
    );
    const brandDone = doneHere || stored;

    function markBrandDone() {
        writeBrandAccountDone(storage(), listingId);
        setDoneHere(true);
        listeners.forEach((cb) => cb());
    }

    const hasLocalStep = steps.length >= 2;
    const total = hasLocalStep ? 2 : 1;
    const completed = hasLocalStep && brandDone ? 1 : 0;
    const activeIsRequest = !hasLocalStep || brandDone;
    const activeStep = activeIsRequest ? steps[steps.length - 1] : steps[0];
    const requested = state.ok === true || status === 'verifying';

    return (
        <div id="acceso" className="scroll-mt-24">
            {status === 'pending' && !requested ? (
                <section className="overflow-hidden rounded-[var(--radius-medio)] border border-[var(--color-borde)] bg-[var(--color-superficie)]">
                    <header className="flex flex-col gap-3 border-b border-[var(--color-borde)] px-5 py-4">
                        <div className="flex items-center justify-between">
                            <h2 className="flex items-center gap-3 font-mono text-[12px] font-medium tracking-[0.14em] text-[var(--color-tenue)]">
                                ACCESO DE LA PLATAFORMA
                                <span className="text-[var(--color-acento)]">+2 NIVELES</span>
                            </h2>
                            <span className="font-mono text-[12px] text-[var(--color-tenue)]">
                                {completed} de {total}
                            </span>
                        </div>
                        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
                            {Array.from({ length: total }, (_, i) => (
                                <span
                                    key={i}
                                    className={`h-1 rounded-[2px] ${i < completed ? 'bg-[var(--color-acento)]' : 'bg-[var(--color-borde-fuerte)]'}`}
                                />
                            ))}
                        </div>
                    </header>

                    <div className="flex flex-col gap-5 px-5 py-5">
                        {completed === 1 && (
                            <div className="flex items-center gap-3 text-[14px] text-[var(--color-apagado)]">
                                <CheckIcon />
                                <span className="line-through">{steps[0].title ?? steps[0].description}</span>
                            </div>
                        )}

                        {activeStep && (
                            <div className="flex flex-col gap-4 rounded-[var(--radius-medio)] border border-[var(--color-borde-fuerte)] bg-[var(--color-superficie-alta)] p-5">
                                <div className="flex flex-col gap-1.5">
                                    <span className="font-mono text-[11px] tracking-[0.12em] text-[var(--color-acento)]">
                                        PASO {completed + 1}
                                    </span>
                                    <h3 className="text-[22px] font-bold leading-tight">
                                        {activeStep.title ?? activeStep.description}
                                    </h3>
                                    {!guided && (
                                        <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                            {activeStep.instruction ?? activeStep.description}
                                        </p>
                                    )}
                                </div>

                                {activeIsRequest && email && (
                                    <div className="flex flex-col gap-1 rounded-[var(--radius-chico)] bg-[var(--color-fondo)] px-3.5 py-3">
                                        <span className="break-all font-mono text-[15px] text-[var(--color-acento)]">{email}</span>
                                        <span className="text-[13px] text-[var(--color-tenue)]">Rol: Administrador</span>
                                    </div>
                                )}

                                {state.error && <Alert>{state.error}</Alert>}

                                <div className="flex flex-wrap gap-2.5">
                                    {guided && (
                                        <Button type="button" onClick={() => setOpenAt(activeIsRequest ? 1 : 0)}>
                                            Ver cómo
                                        </Button>
                                    )}
                                    {activeIsRequest ? (
                                        <form action={submit}>
                                            <Button type="submit" variant={guided ? 'secundario' : 'primario'} disabled={pending}>
                                                {pending ? 'Un momento…' : guided ? 'Ya los invité' : 'Ya lo hice'}
                                            </Button>
                                        </form>
                                    ) : (
                                        <Button type="button" variant="secundario" onClick={markBrandDone}>
                                            Ya lo hice
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-3.5 rounded-[var(--radius-medio)] border border-dashed border-[var(--color-acento)]/30 p-4">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-acento)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
                                <rect x="5" y="11" width="14" height="10" rx="2" />
                                <path d="M8 11V7a4 4 0 0 1 7.5-2" />
                            </svg>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[15px] font-medium">
                                    Desbloqueá{' '}
                                    <span className="font-mono text-[13px] text-[var(--color-acento)]">TRANSFERENCIA INMEDIATA</span>
                                </span>
                                <span className="text-[13px] text-[var(--color-tenue)]">
                                    7 días después de invitarnos tu canal gana más visibilidad en el mercado.
                                </span>
                            </div>
                        </div>
                    </div>
                </section>
            ) : (
                <AccessStatusPanel
                    status={status === 'pending' ? 'verifying' : status}
                    transferableFrom={transferableFrom}
                    now={now}
                />
            )}

            {guided && email && (
                <AccessInstructionsDialog
                    steps={steps}
                    email={email}
                    openAt={openAt}
                    onClose={() => setOpenAt(null)}
                    onBrandAccountDone={markBrandDone}
                    requestAction={() => submit()}
                    pending={pending}
                    error={state.error}
                    requested={requested}
                />
            )}
        </div>
    );
}
