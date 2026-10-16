import { type LevelRow, type MercadoPagoState, levelBreakdown, maxSellerLevel, sellerLevel } from '@/lib/sellerLevel';
import { AssetMark } from './AssetTypeCard';
import { CheckIcon } from './ui';

const RADIUS = 56;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function RowIcon({ row, assetType }: { row: LevelRow; assetType: string }) {
    if (row.key === 'ownership') return <AssetMark assetType={assetType} width={22} />;
    if (row.key === 'access') {
        return (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-acento)" aria-hidden="true" className="flex-none">
                <path d="M11 2h7l-4 7h5L8 22l2.5-9H6z" />
            </svg>
        );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/logos/mercadopago.svg" alt="" className="h-[18px] w-auto flex-none" />;
}

/**
 * El nivel del vendedor, "N de <máximo>", como un anillo que se va llenando y,
 * debajo, qué suma cada logro: tilde y puntos los que ya están, apagados los
 * que faltan.
 */
export function SellerLevelGauge({
    assetType,
    ownershipVerified,
    accessRegistered,
    mercadoPago = 'not_linked',
}: {
    /** De qué es el activo: la fila de titularidad lleva la marca de su tipo. */
    assetType: string;
    ownershipVerified: boolean;
    accessRegistered: boolean;
    mercadoPago?: MercadoPagoState;
}) {
    const input = { ownershipVerified, accessRegistered, mercadoPago };
    const level = sellerLevel(input);
    const rows = levelBreakdown(input);
    const max = maxSellerLevel(mercadoPago);
    const filled = (Math.min(Math.max(level, 0), max) / max) * CIRCUMFERENCE;

    return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-grande)] border border-[var(--color-borde)] bg-[var(--color-superficie)] p-6">
            <div className="relative h-[132px] w-[132px]">
                <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={`Nivel ${level} de ${max}`}>
                    <circle cx="66" cy="66" r={RADIUS} fill="none" stroke="var(--color-borde)" strokeWidth="10" />
                    <circle
                        cx="66"
                        cy="66"
                        r={RADIUS}
                        fill="none"
                        stroke="var(--color-acento)"
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
                        transform="rotate(-90 66 66)"
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-mono text-[36px] leading-none">{level}</span>
                    <span className="text-[12px] text-[var(--color-apagado)]">de {max}</span>
                </div>
            </div>
            <span className="text-[15px] font-medium">Tu nivel de vendedor</span>
            <span className="text-center text-[13px] text-[var(--color-tenue)]">Sumás en el orden que quieras.</span>
            <ul className="mt-1 flex w-full max-w-[240px] flex-col gap-2.5 border-t border-[var(--color-borde)] pt-4">
                {rows.map((row) => (
                    <li
                        key={row.key}
                        className={`flex items-center gap-2.5 text-[14px] ${row.done ? '' : 'text-[var(--color-apagado)]'}`}
                    >
                        <RowIcon row={row} assetType={assetType} />
                        <span className="flex-1">{row.label}</span>
                        {row.done && <CheckIcon />}
                        <span className={`font-mono text-[12px] ${row.done ? 'text-[var(--color-tinta)]' : ''}`}>+{row.points}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
