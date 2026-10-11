import Link from 'next/link';
import { ButtonLink } from './ui';
import { ImmediateBadge, ShimmerBolt } from './ShimmerBolt';

/**
 * «Vendé más rápido»: las dos cosas que acercan el activo a la venta. Sin
 * niveles ni puntos acá: eso es de la pestaña de verificaciones. Cada tarjeta
 * desaparece cuando ya está hecha.
 */
export function SellMoreAside({
    accessHref,
    showAccess,
    showMercadoPago,
}: {
    accessHref: string;
    showAccess: boolean;
    showMercadoPago: boolean;
}) {
    if (!showAccess && !showMercadoPago) return null;

    return (
        <aside className="flex flex-col gap-3">
            <span className="text-[20px] font-bold">Vendé más rápido</span>

            {showAccess && (
                <div className="flex flex-col gap-3.5 rounded-[var(--radius-grande)] border border-[var(--color-borde-fuerte)] bg-[var(--color-superficie)] p-5">
                    <div className="flex items-center gap-3.5">
                        <ShimmerBolt size={32} />
                        <span className="text-[16px] font-medium">Danos acceso de administración</span>
                    </div>
                    <ImmediateBadge />
                    <span className="text-[13px] leading-relaxed text-[var(--color-apagado)]">
                        A los 7 días tu canal la muestra y aparece primero en el mercado.
                    </span>
                    <ButtonLink href={accessHref} className="self-start px-4 py-2.5">
                        Empezar
                    </ButtonLink>
                </div>
            )}

            {showMercadoPago && (
                <Link
                    href="/perfil#mercadopago"
                    className="flex items-center gap-3.5 rounded-[var(--radius-grande)] border border-[var(--color-borde)] bg-[var(--color-superficie)] p-[18px] transition-colors hover:border-[var(--color-borde-fuerte)]"
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logos/mercadopago.svg" alt="Mercado Pago" className="h-[30px] w-auto flex-none" />
                    <div className="flex flex-1 flex-col gap-0.5">
                        <span className="text-[15px] font-medium">Vinculá Mercado Pago</span>
                        <span className="text-[13px] text-[var(--color-tenue)]">
                            El comprador puede pagarte con Mercado Pago.
                        </span>
                    </div>
                    <span aria-hidden="true" className="text-[var(--color-tenue)]">→</span>
                </Link>
            )}
        </aside>
    );
}
