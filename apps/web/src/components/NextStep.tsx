import type { ReactNode } from 'react';
import type { NextStepCopy } from '@/lib/nextStepCopy';

/**
 * «Tu próximo paso»: lo primero que lee cada parte al abrir una operación. Qué
 * le toca —con el formulario para hacerlo al lado— o a quién está esperando y
 * hasta cuándo. Si hay algo que puede adelantar mientras espera, va abajo y
 * aparte, para que no se confunda con lo que traba la operación.
 */
export function NextStepCard({
    copy,
    children,
    meanwhile,
}: {
    copy: NextStepCopy;
    /** El formulario de la acción, si le toca a quien mira. */
    children?: ReactNode;
    /** El formulario de la tarea que no traba nada. */
    meanwhile?: ReactNode;
}) {
    return (
        <section className="flex flex-col gap-4 rounded-[var(--radius-medio)] border border-[var(--color-borde-fuerte)] bg-[var(--color-superficie-alta)] p-5">
            <span className="font-mono text-[11px] tracking-[0.12em] text-[var(--color-acento)]">TU PRÓXIMO PASO</span>
            <div className="flex flex-col gap-1.5">
                <h2 className="text-[20px] font-bold leading-tight">{copy.title}</h2>
                {copy.body && <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">{copy.body}</p>}
                {copy.deadline && <p className="text-[13px] text-[var(--color-alerta)]">{copy.deadline}</p>}
            </div>
            {children}
            {copy.meanwhile && (
                <div className="flex flex-col gap-3 border-t border-[var(--color-borde)] pt-4">
                    <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-tenue)]">MIENTRAS TANTO</span>
                    <div className="flex flex-col gap-1">
                        <span className="text-[15px] font-medium">{copy.meanwhile.title}</span>
                        <span className="text-[13px] leading-relaxed text-[var(--color-tenue)]">{copy.meanwhile.body}</span>
                    </div>
                    {meanwhile}
                </div>
            )}
        </section>
    );
}
