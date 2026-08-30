import Link from 'next/link';
import { anonymousApi } from '@/lib/api';
import { Reveal } from '@/components/Reveal';
import { ListingCard } from '@/components/ListingCard';
import { LockIcon } from '@/components/LockIcon';
import type { ListingSummaryDto } from '@marketplace/api-contract';

type Step = { n: string; title: string; text: string; destacado?: boolean };

const PASOS: Step[] = [
    {
        n: '01',
        title: 'Contrato firmado',
        text: 'Comprador, vendedor y plataforma quedan obligados por el mismo documento.',
    },
    {
        n: '02',
        title: 'Transferencia',
        text: 'El vendedor cede la titularidad del activo a la plataforma.',
    },
    {
        n: '03',
        title: 'Activo en custodia',
        text: 'El punto que cambia todo: recién acá se le pide el pago al comprador.',
        destacado: true,
    },
    {
        n: '04',
        title: 'Operación cerrada',
        text: 'El comprador recibe el activo; el vendedor, su liquidación.',
    },
];

const COBERTURA = [
    {
        parte: 'El vendedor',
        text: 'No le entrega el activo a un desconocido: se lo entrega a la plataforma, que responde por el pago.',
    },
    {
        parte: 'El comprador',
        text: 'No paga contra una promesa: paga cuando el activo ya está en custodia y verificado.',
    },
    {
        parte: 'Los dos',
        text: 'La URL y las métricas crudas del activo se revelan únicamente tras firmar el NDA.',
    },
] as const;

/**
 * Landing. Server Component: el listado se resuelve en el servidor, así que
 * el HTML llega completo y es indexable. Un visitante anónimo ve solo los
 * campos públicos de cada activo — el filtrado lo hace el dominio, no la UI.
 */
export default async function Home() {
    let listings: ListingSummaryDto[] = [];
    try {
        listings = await anonymousApi().listings();
    } catch {
        // La API caída no debe tumbar la landing: el resto de la página
        // explica el producto igual y la sección de activos no se renderiza.
        listings = [];
    }

    return (
        <>
            {/* ── Hero ─────────────────────────────────────────── */}
            <section className="border-b border-[var(--color-borde)]">
                <div className="mx-auto grid max-w-[1400px] gap-14 px-6 py-20 sm:px-12 lg:grid-cols-2 lg:items-center lg:py-24">
                    <div className="flex flex-col gap-6">
                        <Reveal>
                            <div className="flex items-center gap-2.5">
                                <span className="late h-1.5 w-1.5 rounded-full bg-[var(--color-acento)]" />
                                <span className="font-mono text-[11px] tracking-[0.1em] text-[var(--color-acento)]">
                                    CUSTODIA ACTIVA
                                </span>
                            </div>
                        </Reveal>

                        <Reveal delay={80}>
                            <h1 className="text-[42px] font-bold leading-[1.05] tracking-[-0.035em] text-balance sm:text-[55px]">
                                El asset entra en custodia.
                                <br />
                                Después se paga.
                            </h1>
                        </Reveal>

                        <Reveal delay={160}>
                            <p className="max-w-[470px] text-[16px] leading-relaxed text-[var(--color-tenue)] text-pretty">
                                Recibimos el canal antes de que el buyer transfiera un peso. El
                                seller cobra cuando la titularidad ya cambió de manos. Nadie
                                adelanta nada a ciegas.
                            </p>
                        </Reveal>

                        <Reveal delay={240}>
                            <div className="mt-1 flex flex-wrap gap-3">
                                <Link
                                    href="/listings"
                                    className="rounded-[var(--radius-chico)] bg-[var(--color-acento)] px-6 py-3.5 text-[14px] font-bold text-[var(--color-fondo)] transition-transform duration-500 [transition-timing-function:var(--ease-rebote)] hover:-translate-y-0.5"
                                >
                                    Explorar mercado
                                </Link>
                                <Link
                                    href="/vender"
                                    className="rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] px-6 py-3.5 text-[14px] font-medium transition-colors hover:border-[var(--color-tenue)]"
                                >
                                    Publicar asset
                                </Link>
                            </div>
                        </Reveal>
                    </div>

                    <Reveal delay={200}>
                        <div className="overflow-hidden rounded-[var(--radius-medio)] border border-[var(--color-borde)] bg-[var(--color-superficie)]">
                            <div className="border-b border-[var(--color-borde)] px-5 py-3.5">
                                <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-tenue)]">
                                    QUIÉN QUEDA CUBIERTO
                                </span>
                            </div>
                            <div className="flex flex-col gap-5 p-5">
                                {COBERTURA.map((c, i) => (
                                    <div key={c.parte} className="flex flex-col gap-1.5">
                                        {i > 0 && <span className="sr-only" />}
                                        <span className="text-[14px] font-medium text-[var(--color-acento)]">
                                            {c.parte}
                                        </span>
                                        <p className="text-[13px] leading-relaxed text-[var(--color-tenue)]">
                                            {c.text}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Reveal>
                </div>
            </section>

            {/* ── Proceso ──────────────────────────────────────── */}
            <section id="proceso" className="border-b border-[var(--color-borde)]">
                <div className="mx-auto max-w-[1400px] px-6 py-20 sm:px-12">
                    <div className="mb-4 flex items-baseline justify-between">
                        <Reveal>
                            <h2 className="text-[28px] font-bold tracking-[-0.03em] sm:text-[34px]">
                                Cómo se cierra una operación
                            </h2>
                        </Reveal>
                        <Reveal delay={80}>
                            <span className="font-mono text-[12px] text-[var(--color-apagado)]">
                                4 ETAPAS
                            </span>
                        </Reveal>
                    </div>

                    {/* La línea se traza al entrar en pantalla. Es lo que hace
                        que la sección deje de pasar de largo. */}
                    <Reveal trazo>
                        <div className="mb-8 h-px bg-[var(--color-acento)]" />
                    </Reveal>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {PASOS.map((paso, i) => (
                            <Reveal key={paso.n} delay={i * 110}>
                                <div
                                    className={`flex h-full flex-col gap-2.5 rounded-[var(--radius-medio)] border p-6 transition-colors duration-500 ${
                                        paso.destacado
                                            ? 'border-[var(--color-acento)] bg-[var(--color-superficie-alta)]'
                                            : 'border-[var(--color-borde)] bg-[var(--color-superficie)]'
                                    }`}
                                >
                                    <span
                                        className={`font-mono text-[13px] ${
                                            paso.destacado
                                                ? 'text-[var(--color-acento)]'
                                                : 'text-[var(--color-apagado)]'
                                        }`}
                                    >
                                        {paso.n}
                                    </span>
                                    <span className="text-[17px] font-medium tracking-[-0.015em]">
                                        {paso.title}
                                    </span>
                                    <p className="text-[13px] leading-relaxed text-[var(--color-tenue)]">
                                        {paso.text}
                                    </p>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Activos publicados ───────────────────────────── */}
            {listings.length > 0 && (
                <section className="border-b border-[var(--color-borde)]">
                    <div className="mx-auto max-w-[1400px] px-6 py-20 sm:px-12">
                        <div className="mb-7 flex items-baseline justify-between">
                            <Reveal>
                                <h2 className="text-[28px] font-bold tracking-[-0.03em] sm:text-[34px]">
                                    Activos publicados
                                </h2>
                            </Reveal>
                            <Reveal delay={80}>
                                <Link
                                    href="/listings"
                                    className="font-mono text-[12px] text-[var(--color-acento)]"
                                >
                                    VER TODOS →
                                </Link>
                            </Reveal>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {listings.slice(0, 3).map((l, i) => (
                                <Reveal key={l.id} delay={i * 100}>
                                    <ListingCard listing={l} />
                                </Reveal>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* ── Comisión ─────────────────────────────────────── */}
            <section id="comision">
                <div className="mx-auto flex max-w-[1400px] flex-col gap-8 px-6 py-20 sm:px-12 lg:flex-row lg:items-center lg:justify-between">
                    <Reveal>
                        <div className="flex flex-col gap-3">
                            <h2 className="text-[26px] font-bold tracking-[-0.03em] sm:text-[32px]">
                                5 % al buyer, 5 % al seller.
                            </h2>
                            <p className="max-w-[460px] text-[15px] leading-relaxed text-[var(--color-tenue)]">
                                Publicar no cuesta nada. La comisión se cobra solo si la operación
                                se cierra.
                            </p>
                            <p className="mt-1 flex items-center gap-2 text-[13px] text-[var(--color-alerta)]">
                                <LockIcon />
                                Los form sensibles del asset se muestran solo bajo NDA.
                            </p>
                        </div>
                    </Reveal>

                    <Reveal delay={120}>
                        <Link
                            href="/registro"
                            className="inline-block rounded-[var(--radius-chico)] bg-[var(--color-acento)] px-7 py-3.5 text-[14px] font-bold text-[var(--color-fondo)]"
                        >
                            Crear cuenta
                        </Link>
                    </Reveal>
                </div>
            </section>
        </>
    );
}
