import { accessCountdown } from '@/lib/accessCountdown';
import { fechaLarga } from '@/lib/format';
import { ImmediateBadge } from './ShimmerBolt';

/**
 * El acceso de la plataforma una vez que el vendedor avisó que invitó.
 *
 * Tres momentos, con el mismo marco:
 * - `verifying`: un admin todavía no lo confirmó;
 * - `waiting`: confirmado, falta el plazo de Google (cuenta regresiva de 7);
 * - `immediate`: cumplido; el activo aparece primero en el mercado.
 *
 * Es presentacional y recibe la hora de afuera, así no depende del reloj.
 */
export function AccessStatusPanel({
    status,
    transferableFrom,
    now,
}: {
    status: 'verifying' | 'waiting' | 'immediate';
    transferableFrom?: string;
    now: string;
}) {
    return (
        <section className="overflow-hidden rounded-[var(--radius-medio)] border border-[var(--color-borde)] bg-[var(--color-superficie)]">
            <header className="flex items-center justify-between border-b border-[var(--color-borde)] px-5 py-4">
                <h2 className="font-mono text-[12px] font-medium tracking-[0.14em] text-[var(--color-tenue)]">
                    ACCESO DE LA PLATAFORMA
                </h2>
                {status === 'verifying' ? (
                    <span className="flex items-center gap-2 font-mono text-[12px] text-[var(--color-alerta)]">
                        <span aria-hidden="true" className="late h-2 w-2 rounded-full bg-[var(--color-alerta)]" />
                        Verificando
                    </span>
                ) : (
                    <span className="font-mono text-[12px] text-[var(--color-listo)]">Confirmado</span>
                )}
            </header>

            {status === 'verifying' && (
                <div className="flex flex-col gap-2.5 px-5 py-6">
                    <span className="text-[18px] font-bold">Estamos revisando tu invitación</span>
                    <span className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                        Suele llevar menos de un día. Te avisamos cuando quede confirmada.
                    </span>
                </div>
            )}

            {status === 'waiting' && transferableFrom && <Waiting from={transferableFrom} now={now} />}

            {status === 'immediate' && (
                <div className="flex flex-col gap-3 px-5 py-6">
                    <ImmediateBadge />
                    <span className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                        Tu activo aparece primero en el mercado, y quien compre hoy no espera ningún plazo: el
                        contrato se puede firmar el mismo día.
                    </span>
                </div>
            )}
        </section>
    );
}

function Waiting({ from, now }: { from: string; now: string }) {
    const { daysLeft, filled, total } = accessCountdown(from, new Date(now));
    return (
        <div className="flex flex-col gap-5 px-5 py-6">
            <div className="flex items-baseline gap-[18px]">
                <span className="font-mono text-[56px] font-medium leading-none text-[var(--color-acento)]">
                    {daysLeft}
                </span>
                <div className="flex flex-col gap-1">
                    <span className="text-[17px] font-medium">
                        {daysLeft === 1 ? 'día' : 'días'} para la transferencia inmediata
                    </span>
                    <span className="text-[14px] text-[var(--color-tenue)]">
                        El {fechaLarga(from)} tu activo pasa a aparecer primero en el mercado.
                    </span>
                </div>
            </div>
            <div
                role="img"
                aria-label={`${filled} de ${total} días cumplidos`}
                className="grid gap-1"
                style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
            >
                {Array.from({ length: total }, (_, i) => (
                    <span
                        key={i}
                        className={`h-2 rounded-[2px] ${i < filled ? 'bg-[var(--color-acento)]' : 'bg-[var(--color-borde-fuerte)]'}`}
                    />
                ))}
            </div>
            <span className="text-[13px] text-[var(--color-apagado)]">Mientras tanto recibís ofertas normalmente.</span>
        </div>
    );
}
