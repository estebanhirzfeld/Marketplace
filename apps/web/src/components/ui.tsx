import Link from 'next/link';
import type { OperationStatusDto } from '@marketplace/api-contract';

/* ── Botones ──────────────────────────────────────────────
   Un solo lugar define cómo se ve una acción. Cambiar la identidad
   de marca no debería obligar a recorrer 20 archivos. */

type Variant = 'primario' | 'secundario' | 'fantasma' | 'peligro';

const VARIANTS: Record<Variant, string> = {
    primario:
        'bg-[var(--color-acento)] text-[var(--color-fondo)] font-bold hover:-translate-y-0.5',
    secundario:
        'border border-[var(--color-borde-fuerte)] text-[var(--color-tinta)] font-medium hover:border-[var(--color-tenue)]',
    fantasma:
        'text-[var(--color-tenue)] font-medium hover:text-[var(--color-tinta)]',
    peligro:
        'border border-[var(--color-error)]/40 text-[var(--color-error)] font-medium hover:border-[var(--color-error)]',
};

const BASE =
    'inline-flex items-center justify-center gap-2 rounded-[var(--radius-chico)] px-5 py-3 text-[14px] transition-[transform,border-color,color] duration-500 [transition-timing-function:var(--ease-rebote)] disabled:opacity-40 disabled:pointer-events-none';

export function Button({
    variant = 'primario',
    className = '',
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
    return <button {...props} className={`${BASE} ${VARIANTS[variant]} ${className}`} />;
}

export function ButtonLink({
    href,
    variant = 'primario',
    className = '',
    children,
}: {
    href: string;
    variant?: Variant;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <Link href={href} className={`${BASE} ${VARIANTS[variant]} ${className}`}>
            {children}
        </Link>
    );
}

/* ── Etiquetas de estado ──────────────────────────────────
   El color no decora: dice en qué etapa del escrow está la operación. */

const ESTADOS: Record<OperationStatusDto, { text: string; clase: string }> = {
    offer_sent: { text: 'OFERTA ENVIADA', clase: 'text-[var(--color-tenue)] border-[var(--color-borde-fuerte)]' },
    negotiating: { text: 'NEGOCIANDO', clase: 'text-[var(--color-alerta)] border-[var(--color-alerta)]/40' },
    contract_pending: { text: 'ESPERANDO FIRMAS', clase: 'text-[var(--color-alerta)] border-[var(--color-alerta)]/40' },
    contract_signed: { text: 'CONTRATO FIRMADO', clase: 'text-[var(--color-tinta)] border-[var(--color-borde-fuerte)]' },
    transfer_in_progress: { text: 'TRANSFIRIENDO', clase: 'text-[var(--color-tinta)] border-[var(--color-borde-fuerte)]' },
    asset_in_custody: { text: 'EN CUSTODIA', clase: 'text-[var(--color-acento)] border-[var(--color-acento)]/50' },
    payment_received: { text: 'PAGO RECIBIDO', clase: 'text-[var(--color-acento)] border-[var(--color-acento)]/50' },
    completed: { text: 'COMPLETADA', clase: 'text-[var(--color-acento)] border-[var(--color-acento)]' },
    cancelled: { text: 'CANCELADA', clase: 'text-[var(--color-apagado)] border-[var(--color-borde)]' },
};

export function OperationStatusBadge({ state }: { state: OperationStatusDto }) {
    const e = ESTADOS[state];
    return (
        <span className={`rounded-[var(--radius-chico)] border px-2.5 py-1 font-mono text-[11px] tracking-[0.08em] ${e.clase}`}>
            {e.text}
        </span>
    );
}

/* ── Superficies ──────────────────────────────────────────*/

export function Panel({
    title,
    action,
    children,
}: {
    title?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="overflow-hidden rounded-[var(--radius-medio)] border border-[var(--color-borde)] bg-[var(--color-superficie)]">
            {title && (
                <div className="flex items-center justify-between border-b border-[var(--color-borde)] px-5 py-3.5">
                    <span className="font-mono text-[13px] font-medium tracking-[0.08em] text-[var(--color-tenue)]">
                        {title}
                    </span>
                    {action}
                </div>
            )}
            <div className="p-5">{children}</div>
        </div>
    );
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
    return (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-medio)] border border-dashed border-[var(--color-borde-fuerte)] px-6 py-16 text-center">
            <span className="text-[17px] font-medium">{title}</span>
            <p className="max-w-[380px] text-[14px] leading-relaxed text-[var(--color-tenue)]">{text}</p>
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}

export function Alert({ tono = 'error', children }: { tono?: 'error' | 'alerta'; children: React.ReactNode }) {
    const clase =
        tono === 'error'
            ? 'border-[var(--color-error)]/40 text-[var(--color-error)]'
            : 'border-[var(--color-alerta)]/40 text-[var(--color-alerta)]';
    return (
        <div className={`rounded-[var(--radius-chico)] border px-4 py-3 text-[13px] leading-relaxed ${clase}`}>
            {children}
        </div>
    );
}

/* ── Formularios ──────────────────────────────────────────*/

export function Field({
    label,
    hint,
    ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
    return (
        <label className="flex flex-col gap-2">
            <span className="text-[13px] text-[var(--color-tenue)]">{label}</span>
            <input
                {...props}
                className="h-11 rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] bg-[var(--color-fondo)] px-3.5 text-[14px] outline-none transition-colors placeholder:text-[var(--color-apagado)] focus:border-[var(--color-acento)]"
            />
            {hint && <span className="text-[13px] text-[var(--color-apagado)]">{hint}</span>}
        </label>
    );
}

export function Heading({ children, sub }: { children: React.ReactNode; sub?: string }) {
    return (
        <div className="flex flex-col gap-2">
            <h1 className="text-[30px] font-bold tracking-[-0.03em] sm:text-[36px]">{children}</h1>
            {sub && <p className="max-w-[600px] text-[15px] leading-relaxed text-[var(--color-tenue)]">{sub}</p>}
        </div>
    );
}
