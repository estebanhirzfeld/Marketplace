import type { MoneyDto } from '@marketplace/api-contract';
import { money } from '@/lib/format';
import { comparableEstimate, priceDifference, SELLER_COMMISSION_PERCENT } from '@/lib/pricing';

const CONTROL =
    'min-h-[52px] rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] bg-[var(--color-fondo)] text-[var(--color-tinta)] outline-none';

/**
 * El precio que pide el vendedor, con la valuación como referencia al costado.
 *
 * El precio va primero y es el campo principal: la valuación es un dato para
 * ubicarse, no el punto de partida. Es presentacional; el estado vive en el
 * formulario que la usa.
 *
 * La valuación llega en la moneda con que la calcula la API (dólares). Sin una
 * cotización disponible en la web no se convierte: si el vendedor elige pesos,
 * la referencia se muestra «en USD» y no se compara con su precio.
 */
export function PriceSection({
    currency,
    onCurrencyChange,
    price,
    onPriceChange,
    estimated,
    basis,
}: {
    currency: string;
    onCurrencyChange: (value: string) => void;
    price: string;
    onPriceChange: (value: string) => void;
    estimated: MoneyDto | null;
    /** De dónde sale la valuación, dicho para este tipo de activo. Sin valor por omisión: uno fijo se filtraría a otro tipo. */
    basis?: string;
}) {
    const comparable = comparableEstimate(estimated, currency);
    const difference = comparable ? priceDifference(Math.round(Number(price) * 100), comparable.cents) : null;
    const otherCurrency = estimated !== null && comparable === null;

    return (
        <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-[3fr_2fr]">
                <div className="flex flex-col gap-2.5 rounded-[var(--radius-medio)] border border-[var(--color-borde-fuerte)] bg-[var(--color-superficie)] p-5">
                    <label htmlFor="listing-price" className="text-[14px] font-medium">
                        Tu precio
                    </label>
                    <div className="flex gap-2">
                        <select
                            name="moneda"
                            value={currency}
                            onChange={(e) => onCurrencyChange(e.target.value)}
                            aria-label="Moneda"
                            className={`${CONTROL} px-3 text-[15px]`}
                        >
                            <option value="USD">USD</option>
                            <option value="ARS">ARS</option>
                        </select>
                        <input
                            id="listing-price"
                            name="precio"
                            type="number"
                            inputMode="decimal"
                            min={1}
                            step="0.01"
                            required
                            placeholder="0"
                            value={price}
                            onChange={(e) => onPriceChange(e.target.value)}
                            className={`${CONTROL} min-w-0 flex-1 px-3.5 font-mono text-[22px] focus:border-[var(--color-acento)]`}
                        />
                    </div>
                    <span className="text-[13px] text-[var(--color-apagado)]">
                        Es lo que ve el comprador. Lo podés cambiar después de publicar.
                    </span>
                </div>

                <aside className="flex flex-col gap-2 rounded-[var(--radius-medio)] border border-dashed border-[var(--color-borde-fuerte)] p-5">
                    <span className="font-mono text-[11px] tracking-[0.12em] text-[var(--color-apagado)]">
                        REFERENCIA
                    </span>
                    <span className="text-[14px] text-[var(--color-tenue)]">Nuestra valuación</span>
                    <span className="font-mono text-[20px] text-[var(--color-tinta)]">
                        {estimated ? money(estimated) : '—'}
                    </span>
                    {otherCurrency && (
                        <span className="text-[12px] text-[var(--color-apagado)]">en USD</span>
                    )}
                    {difference && (
                        <span className="border-t border-[var(--color-borde)] pt-2 text-[13px] text-[var(--color-alerta)]">
                            {difference.direction === 'equal'
                                ? 'Tu precio coincide con la valuación'
                                : `Tu precio: ${difference.percent} % ${difference.direction === 'above' ? 'arriba' : 'abajo'}`}
                        </span>
                    )}
                </aside>
            </div>

            <div className="flex flex-col gap-1 text-[13px] leading-relaxed text-[var(--color-apagado)]">
                <span>
                    La valuación sale de {basis}.
                    {otherCurrency && ' Por ahora se muestra en dólares.'}
                </span>
                <span>Vos recibís el precio menos el {SELLER_COMMISSION_PERCENT} % de comisión.</span>
            </div>
        </div>
    );
}
