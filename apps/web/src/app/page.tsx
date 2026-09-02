import Link from 'next/link';
import { anonymousApi } from '@/lib/api';
import { Reveal } from '@/components/Reveal';
import { ListingCard } from '@/components/ListingCard';
import { assetTypes } from '@/lib/assetTypes';
import { LockIcon } from '@/components/LockIcon';
import type { ListingSummaryDto } from '@marketplace/api-contract';

type Step = { n: string; title: string; text: string; destacado?: boolean };

/**
 * El recorrido contado como línea de riesgo, no como procedimiento.
 *
 * Antes eran las etapas del sistema —contrato firmado, entrega, verificación,
 * cierre—: la máquina de estados con mejores palabras. Contestaba qué hace la
 * plataforma, que no es lo que alguien se pregunta antes de publicar.
 *
 * Lo que se pregunta es qué arriesga y cuándo. Y la respuesta, repetida tres
 * veces, es que no arriesga nada hasta el final. Que sea monótona es el punto:
 * la monotonía ES el mensaje.
 */
const PASOS: Step[] = [
    {
        n: '01',
        title: 'Publicás',
        text: 'No entregás nada. Nos sumás con permisos mínimos y el activo sigue siendo tuyo.',
    },
    {
        n: '02',
        title: 'Recibís ofertas',
        text: 'Tampoco entregás nada. Negociás el precio con el activo todavía en tus manos.',
    },
    {
        n: '03',
        title: 'Firman los dos',
        text: 'Todavía no entregás nada. El contrato compromete a las dos partes, no al activo.',
    },
    {
        n: '04',
        title: 'Nos das el control',
        text: 'Recién acá. Con el precio cerrado, el contrato firmado y el comprador comprometido.',
        destacado: true,
    },
    {
        n: '05',
        title: 'Cobrás',
        text: 'El comprador ya había pagado: la plata estaba retenida acá desde antes.',
    },
];

/**
 * La promesa en negativo.
 *
 * Reemplaza a una tarjeta que se llamaba "quién queda cubierto" y listaba al
 * vendedor, al comprador y a los dos: una taxonomía, no un mensaje, y con
 * nombre de póliza de seguro.
 *
 * Va en negativo por el mismo motivo que el instructivo del vendedor: cada
 * línea la puede verificar por su cuenta. Una promesa en positivo le pide que
 * nos crea, y la desconfianza es justamente lo que lo frena.
 */
const NO_TE_PEDIMOS = [
    {
        que: 'Que entregues el activo para publicarlo',
        text: 'Nos sumás con permisos mínimos: no podemos eliminarlo, no podemos quitarte a vos, no podemos transferirlo a nadie.',
    },
    {
        que: 'Que confíes en el comprador',
        text: 'No paga por adelantado, pero tampoco recibe nada hasta que el dinero esté acá.',
    },
    {
        que: 'Que confíes en nosotros',
        text: 'Todo lo que decimos lo podés comprobar desde tu propia cuenta, sin pedirnos permiso.',
    },
] as const;

/**
 * Landing. Server Component: el listado se resuelve en el servidor, así que
 * el HTML llega completo y es indexable. Un visitante anónimo ve solo los
 * campos públicos de cada activo — el filtrado lo hace el dominio, no la UI.
 */
export default async function Home() {
    // La metadata del catálogo se pide una vez para toda la grilla: repetirla
    // en cada tarjeta sería mandar lo mismo seis veces.
    const porTipo = new Map((await assetTypes()).map((d) => [d.assetType, d]));

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
                                    COMPRAVENTA PROTEGIDA
                                </span>
                            </div>
                        </Reveal>

                        <Reveal delay={80}>
                            <h1 className="text-[42px] font-bold leading-[1.05] tracking-[-0.035em] text-balance sm:text-[55px]">
                                Primero el activo.
                                <br />
                                Después el pago.
                            </h1>
                        </Reveal>

                        <Reveal delay={160}>
                            {/*
                                Antes esto solo contestaba el miedo del comprador. El del
                                vendedor —"si lo publico, ¿pierdo el control?"— es el que
                                impide que alguien publique, así que es el que va primero.
                            */}
                            <p className="max-w-[470px] text-[16px] leading-relaxed text-[var(--color-tenue)] text-pretty">
                                Publicá y recibí ofertas concretas sin entregar tu activo. Cuando
                                las dos partes están decididas, lo recibimos nosotros, lo
                                verificamos, y recién entonces el comprador paga.
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
                                    Publicar mi activo
                                </Link>
                            </div>
                        </Reveal>
                    </div>

                    <Reveal delay={200}>
                        <div className="overflow-hidden rounded-[var(--radius-medio)] border border-[var(--color-borde)] bg-[var(--color-superficie)]">
                            <div className="border-b border-[var(--color-borde)] px-5 py-3.5">
                                <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-tenue)]">
                                    LO QUE NO TE PEDIMOS
                                </span>
                            </div>
                            <div className="flex flex-col gap-5 p-5">
                                {NO_TE_PEDIMOS.map((c) => (
                                    <div key={c.que} className="flex flex-col gap-1.5">
                                        <span className="text-[14px] font-medium text-[var(--color-acento)]">
                                            {c.que}
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
                                QUÉ ARRIESGA CADA UNO
                            </span>
                        </Reveal>
                    </div>

                    {/* La línea se traza al entrar en pantalla. Es lo que hace
                        que la sección deje de pasar de largo. */}
                    <Reveal trazo>
                        <div className="mb-8 h-px bg-[var(--color-acento)]" />
                    </Reveal>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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

                    {/*
                        Los plazos concretos —siete días en un canal, el bloqueo de la
                        ICANN en un dominio— contestan "¿cómo funciona para MI activo?",
                        que es otra pregunta y otro momento. Viven en la ficha de cada
                        activo, donde el dato es específico y no un promedio.
                    */}
                    <Reveal delay={120}>
                        <p className="mt-8 text-[14px] leading-relaxed text-[var(--color-apagado)]">
                            Los plazos dependen de dónde vive el activo: un canal de YouTube y un
                            dominio tienen reglas distintas, y las impone su plataforma, no
                            nosotros.{' '}
                            <Link href="/listings" className="text-[var(--color-acento)]">
                                Están en la ficha de cada activo
                            </Link>
                            .
                        </p>
                    </Reveal>
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
                                    <ListingCard listing={l} descriptor={porTipo.get(l.assetType)} />
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
                                5 % al comprador, 5 % al vendedor.
                            </h2>
                            <p className="max-w-[460px] text-[15px] leading-relaxed text-[var(--color-tenue)]">
                                Publicar no cuesta nada. La comisión se cobra solo si la operación
                                se cierra.
                            </p>
                            <p className="mt-1 flex items-center gap-2 text-[13px] text-[var(--color-alerta)]">
                                <LockIcon />
                                Los datos que identifican al activo se muestran solo bajo NDA.
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
