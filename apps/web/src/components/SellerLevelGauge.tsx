import { MAX_SELLER_LEVEL } from '@/lib/sellerLevel';

const RADIUS = 56;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** El nivel del vendedor, "N de 4", como un anillo que se va llenando. */
export function SellerLevelGauge({ level }: { level: number }) {
    const filled = (Math.min(Math.max(level, 0), MAX_SELLER_LEVEL) / MAX_SELLER_LEVEL) * CIRCUMFERENCE;

    return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-grande)] border border-[var(--color-borde)] bg-[var(--color-superficie)] p-6">
            <div className="relative h-[132px] w-[132px]">
                <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={`Nivel ${level} de ${MAX_SELLER_LEVEL}`}>
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
                    <span className="text-[12px] text-[var(--color-apagado)]">de {MAX_SELLER_LEVEL}</span>
                </div>
            </div>
            <span className="text-[15px] font-medium">Tu nivel de vendedor</span>
            <span className="text-center text-[13px] text-[var(--color-tenue)]">Sumás en el orden que quieras.</span>
        </div>
    );
}
