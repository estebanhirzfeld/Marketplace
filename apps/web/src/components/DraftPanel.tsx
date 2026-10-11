import { Alert, ButtonLink, CheckLine } from './ui';
import { OperationAction } from './OperationAction';
import { SubmitButton } from './SubmitButton';
import type { ActionState } from '@/app/vender/actions';

type Action = (state: ActionState) => Promise<ActionState>;

/**
 * La tarjeta principal de un borrador: qué falta para que salga al mercado y
 * el botón que lo hace.
 *
 * Tres caras, una por situación del vendedor:
 * - titularidad comprobada: «Listo para publicar», sale en el momento;
 * - sin comprobar: comprobar con Google es lo principal y la revisión a mano,
 *   lo secundario, dicho como alternativa más lenta;
 * - rechazado: solo se puede volver a mandar a revisión.
 *
 * Es la única tarjeta con el acento: es lo que hay que hacer ahora.
 * Presentacional: recibe las acciones, así `/sistema` la muestra sin tocar nada.
 */
export function DraftPanel({
    variant,
    subject,
    sourceLabel,
    price,
    kycVerified,
    rejectionReason,
    publishAction,
    reviewAction,
    verifyAction,
}: {
    variant: 'ready' | 'unverified' | 'rejected';
    /** «canal» o «sitio»: cómo se llama el activo en el texto. */
    subject: string;
    /** Con qué cuenta se comprueba: AdSense o YouTube. */
    sourceLabel: string;
    price: string;
    kycVerified: boolean;
    rejectionReason?: string;
    publishAction: Action;
    reviewAction: Action;
    verifyAction: () => Promise<void>;
}) {
    const tone =
        variant === 'ready'
            ? 'border-[var(--color-acento)]/35 bg-[var(--color-acento)]/[0.04]'
            : variant === 'unverified'
              ? 'border-[var(--color-alerta)]/40'
              : 'border-[var(--color-error)]/40';

    return (
        <section className={`flex flex-col gap-6 rounded-[var(--radius-grande)] border p-7 ${tone}`}>
            {variant === 'ready' && (
                <>
                    <Heading
                        title="Listo para publicar"
                        text={`Comprobamos que el ${subject} es tuyo. Al publicar, aparece en el mercado en el momento.`}
                    />
                    <ul className="flex flex-col gap-2.5">
                        <CheckLine>Sos el titular del {subject}</CheckLine>
                        <Identity kycVerified={kycVerified} />
                        <CheckLine>
                            Precio: <span className="font-mono">{price}</span>
                        </CheckLine>
                    </ul>
                    <div className="w-fit min-w-[180px]">
                        <OperationAction action={publishAction} text="Publicar" />
                    </div>
                </>
            )}

            {variant === 'unverified' && (
                <>
                    <Heading
                        title={`Falta comprobar que el ${subject} es tuyo`}
                        text={`Con tu cuenta de ${sourceLabel} lo comprobamos en un minuto, y al publicar aparece en el mercado en el momento.`}
                    />
                    <ul className="flex flex-col gap-2.5">
                        <Identity kycVerified={kycVerified} />
                        <CheckLine>
                            Precio: <span className="font-mono">{price}</span>
                        </CheckLine>
                        <li className="flex items-center gap-2.5 text-[15px] text-[var(--color-alerta)]">
                            <span aria-hidden="true" className="w-4 text-center">○</span>
                            Titularidad sin comprobar
                        </li>
                    </ul>
                    <form action={verifyAction}>
                        <SubmitButton pendingText="Redirigiendo a Google…" className="min-h-[52px] px-7 text-[16px]">
                            Comprobar con {sourceLabel}
                        </SubmitButton>
                    </form>
                    <div className="flex flex-col gap-2 border-t border-[var(--color-borde)] pt-5">
                        <span className="text-[14px] text-[var(--color-tenue)]">
                            ¿No usás {sourceLabel}?
                        </span>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="w-fit">
                                <OperationAction action={reviewAction} text="Enviar a revisión" variant="secundario" />
                            </div>
                            <span className="text-[13px] text-[var(--color-apagado)]">
                                Lo revisamos a mano. Tarda más.
                            </span>
                        </div>
                    </div>
                </>
            )}

            {variant === 'rejected' && (
                <>
                    <Heading
                        title="Lo rechazamos"
                        text="Corregí lo que indica el motivo y volvé a mandarlo a revisión."
                    />
                    {rejectionReason && <Alert>{rejectionReason}</Alert>}
                    <div className="w-fit">
                        <OperationAction action={reviewAction} text="Enviar a revisión" />
                    </div>
                </>
            )}
        </section>
    );
}

function Heading({ title, text }: { title: string; text: string }) {
    return (
        <div className="flex flex-col gap-1.5">
            <h2 className="text-[26px] font-bold leading-tight tracking-[-0.02em]">{title}</h2>
            <p className="text-[15px] leading-relaxed text-[var(--color-tenue)]">{text}</p>
        </div>
    );
}

/** La identidad no la pone el borrador: sin verificarla no se puede publicar. */
function Identity({ kycVerified }: { kycVerified: boolean }) {
    if (kycVerified) return <CheckLine>Identidad verificada</CheckLine>;
    return (
        <li className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-[var(--color-alerta)]">
            <span className="flex items-center gap-2.5">
                <span aria-hidden="true" className="w-4 text-center">○</span>
                Falta verificar tu identidad
            </span>
            <ButtonLink href="/verificar" variant="fantasma" className="px-0 py-0 text-[13px] underline">
                Verificar ahora
            </ButtonLink>
        </li>
    );
}
