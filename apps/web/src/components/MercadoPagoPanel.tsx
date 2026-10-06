import type { SellerPaymentAccountStatusDto } from '@marketplace/api-contract';
import type { LinkResult } from '@/lib/mercadopagoLink';
import { Alert, Panel } from './ui';
import { SubmitButton } from './SubmitButton';
import { UnlinkMercadoPagoButton } from './UnlinkMercadoPagoButton';

/**
 * `'unavailable'` no es un estado de la cuenta sino de la pantalla: la
 * integración no está configurada, o no pudimos consultarla. Se trata igual,
 * porque a la persona le da lo mismo cuál de las dos fue: no hay nada que
 * pueda hacer ahora.
 */
export type MercadoPagoPanelStatus = SellerPaymentAccountStatusDto | 'unavailable';

type UnlinkAction = React.ComponentProps<typeof UnlinkMercadoPagoButton>['action'];

/**
 * La cuenta de Mercado Pago del vendedor, en su perfil.
 *
 * Quien llega acá lo hace una vez, antes de publicar, a tomar una sola
 * decisión: vincular la cuenta donde va a cobrar. Por eso hay un único botón
 * principal por estado y nada más: ni el identificador de la cuenta ni fechas,
 * que no cambian lo que la persona puede hacer.
 *
 * Es presentacional: recibe las acciones, así `/sistema` puede mostrarlo en
 * cada estado sin tocar nada real.
 */
export function MercadoPagoPanel({
    status,
    result,
    startAction,
    unlinkAction,
}: {
    status: MercadoPagoPanelStatus;
    /** Cómo terminó el último intento, tal como vuelve en la dirección. */
    result?: LinkResult;
    startAction: () => Promise<void>;
    unlinkAction: UnlinkAction;
}) {
    // La acción de vincular avisa con `no-disponible` cuando la API dijo 503:
    // aunque el estado se haya leído bien, no hay nada que ofrecer.
    const unavailable = status === 'unavailable' || result === 'no-disponible';
    const account = status !== 'unavailable' && !unavailable && status.linked ? status : null;
    const linked = account !== null;
    const expired = account?.expired === true;

    return (
        // El ancla es el destino del enlace que aparece al fallar el envío a
        // revisión por falta de cuenta vinculada.
        <div id="mercadopago" className="scroll-mt-24">
            <Panel
                title="MERCADO PAGO"
                action={linked && !expired ? <LinkedBadge /> : undefined}
            >
                <div className="flex flex-col gap-4">
                    {result === 'error' && (
                        <Alert>No pudimos vincular tu cuenta de Mercado Pago. Probá de nuevo.</Alert>
                    )}
                    {result === 'vinculada' && linked && !expired && (
                        <Alert tono="listo">Listo, tu cuenta de Mercado Pago quedó vinculada.</Alert>
                    )}

                    {unavailable ? (
                        <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                            Vincular tu cuenta de Mercado Pago todavía no está disponible. Lo vas a
                            poder hacer en breve.
                        </p>
                    ) : expired ? (
                        <>
                            <Alert tono="alerta">
                                Venció el permiso de tu cuenta de Mercado Pago. Vinculala de nuevo
                                para seguir cobrando.
                            </Alert>
                            <LinkButton action={startAction} text="Vincular de nuevo" />
                        </>
                    ) : linked ? (
                        <>
                            <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                Tu cuenta de Mercado Pago está vinculada. Cobrás tus ventas
                                directamente en ella.
                            </p>
                            <UnlinkMercadoPagoButton action={unlinkAction} />
                        </>
                    ) : (
                        <>
                            <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                Vinculá tu cuenta de Mercado Pago para publicar tus activos y cobrar
                                tus ventas.
                            </p>
                            <LinkButton action={startAction} text="Vincular Mercado Pago" />
                        </>
                    )}
                </div>
            </Panel>
        </div>
    );
}

/** Mismo sello que el de "ACTIVA" en las cuentas de custodia. */
function LinkedBadge() {
    return (
        <span className="rounded-[var(--radius-chico)] border border-[var(--color-acento)]/40 px-2 py-1 font-mono text-[10px] text-[var(--color-acento)]">
            VINCULADA
        </span>
    );
}

function LinkButton({ action, text }: { action: () => Promise<void>; text: string }) {
    return (
        <form action={action} className="self-start">
            <SubmitButton pendingText="Un momento…">{text}</SubmitButton>
        </form>
    );
}
