import Link from 'next/link';
import { requireCounterparty } from '@/lib/guards';
import { Reveal } from '@/components/Reveal';
import { PublishListingForm } from '@/components/PublishListingForm';
import { Panel, Heading } from '@/components/ui';
import { estimateListingPrice, publishListing } from './actions';

export const metadata = { title: 'Publicar un activo · Traspaso' };

/**
 * Publicar y nada más.
 *
 * Esta pantalla mostraba además el catálogo entero, con las acciones de cada
 * activo apretadas en una fila: "Vender" es un verbo y lo que había era una
 * lista. El catálogo vive ahora en `/activos`, y cada activo tiene su propia
 * vista.
 */
export default async function Publicar() {
    await requireCounterparty();

    return (
        <div className="mx-auto max-w-[1100px] px-6 py-16 sm:px-12">
            <Reveal>
                <div className="flex items-center gap-2 text-[13px] text-[var(--color-apagado)]">
                    <Link href="/activos" className="hover:text-[var(--color-tinta)]">
                        Mis activos
                    </Link>
                    <span>/</span>
                    <span className="text-[var(--color-tenue)]">Publicar</span>
                </div>

                <div className="mt-4">
                    <Heading sub="Publicá un activo nuevo. Los que ya cargaste están en Mis activos.">
                        Publicar un activo
                    </Heading>
                </div>
            </Reveal>

            <div className="mt-10 max-w-[720px]">
                <Reveal delay={80}>
                    <Panel title="NUEVO ACTIVO">
                        <PublishListingForm action={publishListing} estimate={estimateListingPrice} />
                    </Panel>
                </Reveal>

                <Reveal delay={140}>
                    <p className="mt-5 text-[14px] leading-relaxed text-[var(--color-tenue)]">
                        Se guarda como borrador. Al enviarlo a revisión lo evaluamos antes de
                        publicarlo, y en ese momento te pedimos el acceso al activo.
                    </p>
                </Reveal>
            </div>
        </div>
    );
}
