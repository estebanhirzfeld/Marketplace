import { ButtonLink, CheckIcon } from './ui';
import { ShimmerBolt } from './ShimmerBolt';
import { SubmitButton } from './SubmitButton';

/**
 * Lo que le falta sumar al vendedor, y lo que ya sumó.
 *
 * Lo que falta va en tarjetas con su botón; lo que ya está, en una línea con un
 * tilde chico, sin caja: un logro no necesita ocupar lugar.
 */
export function VerificationCards({
    ownership,
    access,
    mercadoPago,
    ownershipSource,
    kycVerified,
    verifyAction,
    accessHref,
}: {
    ownership: { done: boolean; sourceLabel: string; verifiedAt?: string };
    access: { done: boolean };
    mercadoPago: { done: boolean; unavailable?: boolean };
    ownershipSource: string;
    kycVerified: boolean;
    verifyAction: () => Promise<void>;
    accessHref: string;
}) {
    return (
        <>
            <div className="grid gap-4 md:grid-cols-2">
                {!ownership.done && (
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
                {!access.done && (
                    <Card
                        icon={<ShimmerBolt size={36} />}
                        title="Acceso de administración"
                        points="+2 NIVELES"
                        text="A los 7 días tu canal pasa a TRANSFERENCIA INMEDIATA y aparece primero en el mercado."
                    >
                        <ButtonLink href={accessHref} className="px-[18px] py-3">
                            Darnos acceso
                        </ButtonLink>
                    </Card>
                )}
                {!mercadoPago.done && !mercadoPago.unavailable && (
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

            <ul className="flex flex-wrap gap-x-6 gap-y-2 pt-1 text-[14px] text-[var(--color-tenue)]">
                {ownership.done && (
                    <DoneLine>
                        Titularidad comprobada contra {ownership.sourceLabel} ·{' '}
                        <span className="font-mono text-[12px] text-[var(--color-tinta)]">+1</span>
                        {ownership.verifiedAt && (
                            <span className="text-[var(--color-apagado)]">
                                {' '}
                                · {new Date(ownership.verifiedAt).toLocaleDateString('es-AR')}
                            </span>
                        )}
                    </DoneLine>
                )}
                {access.done && (
                    <DoneLine>
                        Acceso de administración · <span className="font-mono text-[12px] text-[var(--color-tinta)]">+2</span>
                    </DoneLine>
                )}
                {mercadoPago.done && (
                    <DoneLine>
                        Mercado Pago vinculado · <span className="font-mono text-[12px] text-[var(--color-tinta)]">+1</span>
                    </DoneLine>
                )}
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
