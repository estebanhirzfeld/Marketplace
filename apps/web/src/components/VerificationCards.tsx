import { ButtonLink, CheckIcon } from './ui';
import { SubmitButton } from './SubmitButton';

/**
 * Lo que le falta sumar al vendedor, y lo que ya sumó.
 *
 * Lo que falta va en tarjetas con su botón. Lo que ya está suma en el desglose
 * del anillo de nivel, así que acá solo queda la línea de la identidad, que es
 * requisito para publicar y no puntúa. El acceso de administración no tiene
 * tarjeta: mientras falta, lo pide el panel de acceso.
 */
export function VerificationCards({
    ownership,
    mercadoPago,
    ownershipSource,
    kycVerified,
    verifyAction,
    dnsVerification,
}: {
    ownership: { done: boolean; sourceLabel: string; verifiedAt?: string };
    /** Se acepta por compatibilidad: ya no dibuja nada, lo cuenta el desglose del nivel. */
    access?: { done: boolean };
    mercadoPago: { done: boolean; unavailable?: boolean };
    ownershipSource: string;
    kycVerified: boolean;
    verifyAction: () => Promise<void>;
    /**
     * Que la fuente es DNS. La comprobación no redirige a Google: hay un
     * registro que cargar, y su botón vive en la tarjeta del activo (junto al
     * nombre del sitio), no en otra tarjeta. Acá no se repite.
     */
    dnsVerification?: React.ReactNode;
}) {
    const showOwnership = !ownership.done && !dnsVerification;
    const showMercadoPago = !mercadoPago.done && !mercadoPago.unavailable;

    return (
        <>
            {(showOwnership || showMercadoPago) && (
                <div className="grid gap-4 md:grid-cols-2">
                    {showOwnership && (
                        <Card
                            icon={<span className="font-mono text-[20px] text-[var(--color-acento)]">✓</span>}
                            title="Comprobar titularidad"
                            points="+1 NIVEL"
                            text="Publicás sin revisión y tus números llevan sello."
                        >
                            <form action={verifyAction}>
                                <SubmitButton pendingText="Redirigiendo a Google…" className="px-[18px] py-3">
                                    Comprobar con {ownershipSource}
                                </SubmitButton>
                            </form>
                        </Card>
                    )}
                    {showMercadoPago && (
                        <Card
                            icon={
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src="/logos/mercadopago.svg" alt="" className="h-[34px] w-auto flex-none" />
                            }
                            title="Mercado Pago"
                            points="+1 NIVEL"
                            text="El comprador puede pagarte con Mercado Pago y cobrás directo en tu cuenta."
                        >
                            <ButtonLink href="/perfil#mercadopago" variant="secundario" className="px-[18px] py-3">
                                Vincular
                            </ButtonLink>
                        </Card>
                    )}
                </div>
            )}

            <ul className="flex flex-wrap gap-x-6 gap-y-2 pt-1 text-[14px] text-[var(--color-tenue)]">
                {kycVerified ? (
                    <DoneLine>Identidad verificada · requisito para publicar</DoneLine>
                ) : (
                    <li className="flex items-center gap-2.5 text-[var(--color-alerta)]">
                        Falta verificar tu identidad, que es requisito para publicar ·{' '}
                        <ButtonLink href="/verificar" variant="fantasma" className="px-0 py-0 text-[14px] underline">
                            Verificar ahora
                        </ButtonLink>
                    </li>
                )}
            </ul>
        </>
    );
}

function DoneLine({ children }: { children: React.ReactNode }) {
    return (
        <li className="flex items-center gap-2.5">
            <CheckIcon />
            <span>{children}</span>
        </li>
    );
}

function Card({
    icon,
    title,
    points,
    text,
    children,
}: {
    icon: React.ReactNode;
    title: string;
    points: string;
    text: string;
    children: React.ReactNode;
}) {
    return (
        <article className="flex flex-col gap-4 rounded-[var(--radius-grande)] border border-[var(--color-borde-fuerte)] bg-[var(--color-superficie)] p-6">
            <div className="flex items-center gap-3.5">
                {icon}
                <div className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[17px] font-bold">{title}</span>
                    <span className="font-mono text-[12px] text-[var(--color-acento)]">{points}</span>
                </div>
            </div>
            <span className="text-[14px] leading-relaxed text-[var(--color-tenue)]">{text}</span>
            <div className="mt-auto self-start">{children}</div>
        </article>
    );
}
