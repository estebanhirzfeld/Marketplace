import Link from 'next/link';
import type { OperationStatusDto } from '@marketplace/api-contract';

/* ── Botones ──────────────────────────────────────────────
   Un solo lugar define cómo se ve una acción. Cambiar la identidad
   de marca no debería obligar a recorrer 20 archivos. */

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro';

const VARIANTES: Record<Variante, string> = {
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

export function Boton({
    variante = 'primario',
    className = '',
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
    return <button {...props} className={`${BASE} ${VARIANTES[variante]} ${className}`} />;
}

export function BotonEnlace({
    href,
    variante = 'primario',
    className = '',
    children,
}: {
    href: string;
    variante?: Variante;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <Link href={href} className={`${BASE} ${VARIANTES[variante]} ${className}`}>
            {children}
        </Link>
    );
}

/* ── Etiquetas de estado ──────────────────────────────────
   El color no decora: dice en qué etapa del escrow está la operación. */

const ESTADOS: Record<OperationStatusDto, { texto: string; clase: string }> = {
    offer_sent: { texto: 'OFERTA ENVIADA', clase: 'text-[var(--color-tenue)] border-[var(--color-borde-fuerte)]' },
    negotiating: { texto: 'NEGOCIANDO', clase: 'text-[var(--color-alerta)] border-[var(--color-alerta)]/40' },
    contract_pending: { texto: 'ESPERANDO FIRMAS', clase: 'text-[var(--color-alerta)] border-[var(--color-alerta)]/40' },
    contract_signed: { texto: 'CONTRATO FIRMADO', clase: 'text-[var(--color-tinta)] border-[var(--color-borde-fuerte)]' },
    transfer_in_progress: { texto: 'TRANSFIRIENDO', clase: 'text-[var(--color-tinta)] border-[var(--color-borde-fuerte)]' },
    asset_in_custody: { texto: 'EN CUSTODIA', clase: 'text-[var(--color-acento)] border-[var(--color-acento)]/50' },
    payment_received: { texto: 'PAGO RECIBIDO', clase: 'text-[var(--color-acento)] border-[var(--color-acento)]/50' },
    completed: { texto: 'COMPLETADA', clase: 'text-[var(--color-acento)] border-[var(--color-acento)]' },
    cancelled: { texto: 'CANCELADA', clase: 'text-[var(--color-apagado)] border-[var(--color-borde)]' },
};

export function EstadoOperacion({ estado }: { estado: OperationStatusDto }) {
    const e = ESTADOS[estado];
    return (
        <span className={`rounded-[var(--radius-chico)] border px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] ${e.clase}`}>
            {e.texto}
        </span>
    );
}

/* ── Superficies ──────────────────────────────────────────*/

export function Panel({
    titulo,
    accion,
    children,
}: {
    titulo?: string;
    accion?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="overflow-hidden rounded-[var(--radius-medio)] border border-[var(--color-borde)] bg-[var(--color-superficie)]">
            {titulo && (
                <div className="flex items-center justify-between border-b border-[var(--color-borde)] px-5 py-3.5">
                    <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-tenue)]">
                        {titulo}
                    </span>
                    {accion}
                </div>
            )}
            <div className="p-5">{children}</div>
        </div>
    );
}

export function Vacio({ titulo, texto, accion }: { titulo: string; texto: string; accion?: React.ReactNode }) {
    return (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-medio)] border border-dashed border-[var(--color-borde-fuerte)] px-6 py-16 text-center">
            <span className="text-[17px] font-medium">{titulo}</span>
            <p className="max-w-[380px] text-[14px] leading-relaxed text-[var(--color-tenue)]">{texto}</p>
            {accion && <div className="mt-2">{accion}</div>}
        </div>
    );
}

export function Aviso({ tono = 'error', children }: { tono?: 'error' | 'alerta'; children: React.ReactNode }) {
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

export function Campo({
    etiqueta,
    ayuda,
    ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; ayuda?: string }) {
    return (
        <label className="flex flex-col gap-2">
            <span className="text-[13px] text-[var(--color-tenue)]">{etiqueta}</span>
            <input
                {...props}
                className="h-11 rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] bg-[var(--color-fondo)] px-3.5 text-[14px] outline-none transition-colors placeholder:text-[var(--color-fantasma)] focus:border-[var(--color-acento)]"
            />
            {ayuda && <span className="text-[12px] text-[var(--color-apagado)]">{ayuda}</span>}
        </label>
    );
}

export function Titulo({ children, sub }: { children: React.ReactNode; sub?: string }) {
    return (
        <div className="flex flex-col gap-2">
            <h1 className="text-[30px] font-bold tracking-[-0.03em] sm:text-[36px]">{children}</h1>
            {sub && <p className="max-w-[600px] text-[15px] leading-relaxed text-[var(--color-tenue)]">{sub}</p>}
        </div>
    );
}
