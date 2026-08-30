import Link from 'next/link';
import { apiAnonima } from '@/lib/api';
import { Revelar } from '@/components/Revelar';
import { TarjetaListing } from '@/components/TarjetaListing';
import { Candado } from '@/components/Candado';
import type { ListingSummaryDto } from '@marketplace/api-contract';

type Paso = { n: string; titulo: string; texto: string; destacado?: boolean };

const PASOS: Paso[] = [
    {
        n: '01',
        titulo: 'Contrato firmado',
        texto: 'Comprador, vendedor y plataforma quedan obligados por el mismo documento.',
    },
    {
        n: '02',
        titulo: 'Transferencia',
        texto: 'El vendedor cede la titularidad del activo a la plataforma.',
    },
    {
        n: '03',
        titulo: 'Activo en custodia',
        texto: 'El punto que cambia todo: recién acá se le pide el pago al comprador.',
        destacado: true,
    },
    {
        n: '04',
        titulo: 'Operación cerrada',
        texto: 'El comprador recibe el activo; el vendedor, su liquidación.',
    },
];

const COBERTURA = [
    {
        parte: 'El vendedor',
        texto: 'No le entrega el activo a un desconocido: se lo entrega a la plataforma, que responde por el pago.',
    },
    {
        parte: 'El comprador',
        texto: 'No paga contra una promesa: paga cuando el activo ya está en custodia y verificado.',
    },
    {
        parte: 'Los dos',
        texto: 'La URL y las métricas crudas del activo se revelan únicamente tras firmar el NDA.',
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
        listings = await apiAnonima().listings();
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
                        <Revelar>
                            <div className="flex items-center gap-2.5">
                                <span className="late h-1.5 w-1.5 rounded-full bg-[var(--color-acento)]" />
                                <span className="font-mono text-[11px] tracking-[0.1em] text-[var(--color-acento)]">
                                    CUSTODIA ACTIVA
                                </span>
                            </div>
                        </Revelar>

                        <Revelar retraso={80}>
                            <h1 className="text-[42px] font-bold leading-[1.05] tracking-[-0.035em] text-balance sm:text-[55px]">
                                El activo entra en custodia.
                                <br />
                                Después se paga.
                            </h1>
                        </Revelar>

                        <Revelar retraso={160}>
                            <p className="max-w-[470px] text-[16px] leading-relaxed text-[var(--color-tenue)] text-pretty">
                                Recibimos el canal antes de que el comprador transfiera un peso. El
                                vendedor cobra cuando la titularidad ya cambió de manos. Nadie
                                adelanta nada a ciegas.
                            </p>
                        </Revelar>

                        <Revelar retraso={240}>
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
                                    Publicar activo
                                </Link>
                            </div>
                        </Revelar>
                    </div>

                    <Revelar retraso={200}>
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
                                            {c.texto}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Revelar>
                </div>
            </section>

            {/* ── Proceso ──────────────────────────────────────── */}
            <section id="proceso" className="border-b border-[var(--color-borde)]">
                <div className="mx-auto max-w-[1400px] px-6 py-20 sm:px-12">
                    <div className="mb-4 flex items-baseline justify-between">
                        <Revelar>
                            <h2 className="text-[28px] font-bold tracking-[-0.03em] sm:text-[34px]">
                                Cómo se cierra una operación
                            </h2>
                        </Revelar>
                        <Revelar retraso={80}>
                            <span className="font-mono text-[12px] text-[var(--color-apagado)]">
                                4 ETAPAS
                            </span>
                        </Revelar>
                    </div>

                    {/* La línea se traza al entrar en pantalla. Es lo que hace
                        que la sección deje de pasar de largo. */}
                    <Revelar trazo>
                        <div className="mb-8 h-px bg-[var(--color-acento)]" />
                    </Revelar>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {PASOS.map((paso, i) => (
                            <Revelar key={paso.n} retraso={i * 110}>
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
                                        {paso.titulo}
                                    </span>
                                    <p className="text-[13px] leading-relaxed text-[var(--color-tenue)]">
                                        {paso.texto}
                                    </p>
                                </div>
                            </Revelar>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Activos publicados ───────────────────────────── */}
            {listings.length > 0 && (
                <section className="border-b border-[var(--color-borde)]">
                    <div className="mx-auto max-w-[1400px] px-6 py-20 sm:px-12">
                        <div className="mb-7 flex items-baseline justify-between">
                            <Revelar>
                                <h2 className="text-[28px] font-bold tracking-[-0.03em] sm:text-[34px]">
                                    Activos publicados
                                </h2>
                            </Revelar>
                            <Revelar retraso={80}>
                                <Link
                                    href="/listings"
                                    className="font-mono text-[12px] text-[var(--color-acento)]"
                                >
                                    VER TODOS →
                                </Link>
                            </Revelar>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {listings.slice(0, 3).map((l, i) => (
                                <Revelar key={l.id} retraso={i * 100}>
                                    <TarjetaListing listing={l} />
                                </Revelar>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* ── Comisión ─────────────────────────────────────── */}
            <section id="comision">
                <div className="mx-auto flex max-w-[1400px] flex-col gap-8 px-6 py-20 sm:px-12 lg:flex-row lg:items-center lg:justify-between">
                    <Revelar>
                        <div className="flex flex-col gap-3">
                            <h2 className="text-[26px] font-bold tracking-[-0.03em] sm:text-[32px]">
                                5 % al comprador, 5 % al vendedor.
                            </h2>
                            <p className="max-w-[460px] text-[15px] leading-relaxed text-[var(--color-tenue)]">
                                Publicar no cuesta nada. La comisión se cobra solo si la operación
                                se cierra.
                            </p>
                            <p className="mt-1 flex items-center gap-2 text-[13px] text-[var(--color-alerta)]">
                                <Candado />
                                Los datos sensibles del activo se muestran solo bajo NDA.
                            </p>
                        </div>
                    </Revelar>

                    <Revelar retraso={120}>
                        <Link
                            href="/registro"
                            className="inline-block rounded-[var(--radius-chico)] bg-[var(--color-acento)] px-7 py-3.5 text-[14px] font-bold text-[var(--color-fondo)]"
                        >
                            Crear cuenta
                        </Link>
                    </Revelar>
                </div>
            </section>
        </>
    );
}
