import Link from 'next/link';

/**
 * Varias pantallas llaman a `notFound()` —un activo que no existe, una
 * operación ajena, un contrato de otro— y todas caían en la pantalla por
 * defecto de Next, en inglés y sin salida.
 *
 * El texto no distingue "no existe" de "no es tuyo" a propósito: decir que
 * existe pero no te corresponde ya confirma que existe.
 */
export default function NoEncontrado() {
    return (
        <div className="mx-auto flex max-w-[560px] flex-col items-start gap-5 px-6 py-24 sm:px-12">
            <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-tenue)]">
                NO ENCONTRADO
            </span>
            <h1 className="text-[28px] font-bold tracking-[-0.02em]">
                Acá no hay nada
            </h1>
            <p className="text-[15px] leading-relaxed text-[var(--color-tenue)]">
                La dirección no corresponde a ninguna página, o el contenido dejó de estar
                disponible. Si llegaste desde un enlace viejo, puede que el activo ya se haya
                vendido.
            </p>
            <Link
                href="/listings"
                className="rounded-[var(--radius-chico)] bg-[var(--color-acento)] px-4 py-2 text-[14px] font-bold text-[var(--color-fondo)]"
            >
                Ir al mercado
            </Link>
        </div>
    );
}
