import type { ListingSummaryDto, ListingFiltersQuery } from '@marketplace/api-contract';
import { ApiError } from '@marketplace/api-client';
import { anonymousApi } from '@/lib/api';
import { Reveal } from '@/components/Reveal';
import { ListingCard } from '@/components/ListingCard';
import { MarketFilters } from '@/components/MarketFilters';
import { ButtonLink, Heading, EmptyState } from '@/components/ui';

export const metadata = {
    title: 'Mercado · Traspaso',
    description: 'Canales de YouTube, sitios web y cuentas sociales en venta, con custodia de la plataforma.',
};

function aEntero(value: string | string[] | undefined): number | undefined {
    if (typeof value !== 'string') return undefined;
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/**
 * Listado público, renderizado en el servidor para que sea indexable. Cada
 * combinación de filtros tiene su URL propia.
 */
export default async function Listings(props: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    // En Next 16 `searchParams` es una promesa.
    const params = await props.searchParams;

    const filtros: ListingFiltersQuery = {
        assetType: typeof params.assetType === 'string' ? params.assetType : undefined,
        minPrice: aEntero(params.minPrice),
        maxPrice: aEntero(params.maxPrice),
    };

    let listings: ListingSummaryDto[] = [];
    let problema: string | undefined;

    try {
        listings = await anonymousApi().listings(filtros);
    } catch (e) {
        problema =
            e instanceof ApiError
                ? e.message
                : 'El servidor no respondió. Probá recargar en un momento.';
    }

    const conFiltros = Boolean(filtros.assetType || filtros.minPrice || filtros.maxPrice);

    return (
        <div className="mx-auto max-w-[1400px] px-6 py-16 sm:px-12">
            <Reveal>
                <Heading sub="Todos los activos publicados. Los datos sensibles de un activo confidencial se revelan al firmar el NDA en su ficha.">
                    Mercado
                </Heading>
            </Reveal>

            <div className="mt-8">
                <Reveal delay={80}>
                    <MarketFilters actuales={filtros} />
                </Reveal>
            </div>

            <div className="mt-8">
                {problema ? (
                    <EmptyState title="No pudimos cargar el mercado" text={problema} />
                ) : listings.length === 0 ? (
                    <EmptyState
                        title={conFiltros ? 'Nada coincide con esos filtros' : 'Todavía no hay activos publicados'}
                        text={
                            conFiltros
                                ? 'Probá ampliar el rango de precio o sacar el filtro de tipo.'
                                : 'Sé el primero: publicá tu canal, sitio o cuenta y recibí ofertas con la plata protegida por la plataforma.'
                        }
                        action={
                            conFiltros ? (
                                <ButtonLink href="/listings" variant="secundario">Limpiar filtros</ButtonLink>
                            ) : (
                                <ButtonLink href="/vender">Publicar mi asset</ButtonLink>
                            )
                        }
                    />
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {listings.map((l, i) => (
                            <Reveal key={l.id} delay={Math.min(i, 6) * 70}>
                                <ListingCard listing={l} />
                            </Reveal>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
