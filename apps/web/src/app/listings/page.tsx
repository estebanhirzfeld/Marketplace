import type { ListingSummaryDto, ListingFiltersQuery } from '@marketplace/api-contract';
import { ASSET_NICHES } from '@marketplace/shared-types';
import { ApiError } from '@marketplace/api-client';
import { anonymousApi } from '@/lib/api';
import { Reveal } from '@/components/Reveal';
import { ListingCard } from '@/components/ListingCard';
import { MarketFilters, type FiltrosDeBusqueda } from '@/components/MarketFilters';
import { MarketSort } from '@/components/MarketSort';
import { ButtonLink, Heading, EmptyState } from '@/components/ui';

export const metadata = {
    title: 'Mercado · Traspaso',
    description: 'Canales de YouTube y sitios web en venta, con custodia de la plataforma.',
};

function aEntero(value: string | string[] | undefined): number | undefined {
    if (typeof value !== 'string' || value.trim() === '') return undefined;
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 ? n : undefined;
}

function aOpcion<T extends string>(
    value: string | string[] | undefined,
    validos: readonly T[],
): T | undefined {
    return typeof value === 'string' && (validos as readonly string[]).includes(value)
        ? (value as T)
        : undefined;
}

const TIPOS = ['youtube', 'web'] as const;
const MONEDAS = ['ARS', 'USD'] as const;
const ORDENES = ['price', 'created', 'published', 'estimated'] as const;
const DIRECCIONES = ['asc', 'desc'] as const;

/**
 * Traduce la URL a lo que entiende la API.
 *
 * Los precios viajan en la URL en unidades enteras —es lo que la persona
 * escribe y lo que ve si comparte el enlace— y el resto del sistema trabaja en
 * centavos, así que la conversión pasa por acá.
 *
 * Los filtros propios de un tipo solo se leen si el tipo corresponde: mandar
 * suscriptores junto a `web` haría que la API rechace la consulta entera.
 */
function leerFiltros(params: Record<string, string | string[] | undefined>): {
    busqueda: FiltrosDeBusqueda;
    consulta: ListingFiltersQuery;
} {
    const assetType = aOpcion(params.assetType, TIPOS);
    const minPrice = aEntero(params.minPrice);
    const maxPrice = aEntero(params.maxPrice);
    const hayRango = minPrice !== undefined || maxPrice !== undefined;

    const busqueda: FiltrosDeBusqueda = {
        assetType,
        // El rubro y la transferibilidad no son propios de un tipo: se leen
        // siempre, con cualquier tipo elegido o sin ninguno.
        niche: aOpcion(params.niche, ASSET_NICHES),
        onlyTransferable: params.onlyTransferable === 'true' ? true : undefined,
        // Sin rango no hace falta moneda, y mandarla acotaría sin que se pida.
        currency: hayRango ? (aOpcion(params.currency, MONEDAS) ?? 'USD') : undefined,
        minPrice,
        maxPrice,
        minSubscribers: assetType === 'youtube' ? aEntero(params.minSubscribers) : undefined,
        onlyMonetized: assetType === 'youtube' && params.onlyMonetized === 'true' ? true : undefined,
        minDomainAuthority: assetType === 'web' ? aEntero(params.minDomainAuthority) : undefined,
        sort: aOpcion(params.sort, ORDENES),
        direction: aOpcion(params.direction, DIRECCIONES),
    };

    return {
        busqueda,
        consulta: {
            ...busqueda,
            minPrice: minPrice === undefined ? undefined : minPrice * 100,
            maxPrice: maxPrice === undefined ? undefined : maxPrice * 100,
        },
    };
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

    const { busqueda, consulta } = leerFiltros(params);

    let listings: ListingSummaryDto[] = [];
    let problema: string | undefined;

    try {
        listings = await anonymousApi().listings(consulta);
    } catch (e) {
        problema =
            e instanceof ApiError
                ? e.message
                : 'El servidor no respondió. Probá recargar en un momento.';
    }

    const conFiltros = Object.values(busqueda).some((v) => v !== undefined);

    return (
        <div className="mx-auto max-w-[1400px] px-6 py-16 sm:px-12">
            <Reveal>
                <Heading sub="Todos los activos publicados. Los datos sensibles de un activo confidencial se revelan al firmar el NDA en su ficha.">
                    Mercado
                </Heading>
            </Reveal>

            {/* Los filtros al costado y el orden arriba de los resultados: el
                orden se toca seguido y los filtros se dejan puestos. */}
            <div className="mt-10 grid gap-10 lg:grid-cols-[240px_1fr]">
                <Reveal delay={80}>
                    <MarketFilters actuales={busqueda} />
                </Reveal>

                <div className="flex flex-col gap-6">
                    {!problema && listings.length > 0 && (
                        <Reveal>
                            <MarketSort actuales={busqueda} cantidad={listings.length} />
                        </Reveal>
                    )}

                    {problema ? (
                        <EmptyState title="No pudimos cargar el mercado" text={problema} />
                    ) : listings.length === 0 ? (
                        <EmptyState
                            title={conFiltros ? 'Nada coincide con esos filtros' : 'Todavía no hay activos publicados'}
                            text={
                                conFiltros
                                    ? 'Probá ampliar el rango de precio, bajar los mínimos o sacar el filtro de tipo.'
                                    : 'Sé el primero: publicá tu canal o sitio y recibí ofertas con el pago protegido por la plataforma.'
                            }
                            action={
                                conFiltros ? (
                                    <ButtonLink href="/listings" variant="secundario">Limpiar filtros</ButtonLink>
                                ) : (
                                    <ButtonLink href="/vender">Publicar mi activo</ButtonLink>
                                )
                            }
                        />
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {listings.map((l, i) => (
                                <Reveal key={l.id} delay={Math.min(i, 6) * 70}>
                                    <ListingCard listing={l} />
                                </Reveal>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
