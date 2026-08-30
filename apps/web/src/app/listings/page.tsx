import type { ListingSummaryDto, ListingFiltersQuery } from '@marketplace/api-contract';
import { ApiError } from '@marketplace/api-client';
import { apiAnonima } from '@/lib/api';
import { Revelar } from '@/components/Revelar';
import { TarjetaListing } from '@/components/TarjetaListing';
import { FiltrosMercado } from '@/components/FiltrosMercado';
import { BotonEnlace, Titulo, Vacio } from '@/components/ui';

export const metadata = {
    title: 'Mercado · Traspaso',
    description: 'Canales de YouTube, sitios web y cuentas sociales en venta, con custodia de la plataforma.',
};

function aEntero(valor: string | string[] | undefined): number | undefined {
    if (typeof valor !== 'string') return undefined;
    const n = Number(valor);
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
        listings = await apiAnonima().listings(filtros);
    } catch (e) {
        problema =
            e instanceof ApiError
                ? e.message
                : 'El servidor no respondió. Probá recargar en un momento.';
    }

    const conFiltros = Boolean(filtros.assetType || filtros.minPrice || filtros.maxPrice);

    return (
        <div className="mx-auto max-w-[1400px] px-6 py-16 sm:px-12">
            <Revelar>
                <Titulo sub="Todos los activos publicados. Los datos sensibles de un activo confidencial se revelan al firmar el NDA en su ficha.">
                    Mercado
                </Titulo>
            </Revelar>

            <div className="mt-8">
                <Revelar retraso={80}>
                    <FiltrosMercado actuales={filtros} />
                </Revelar>
            </div>

            <div className="mt-8">
                {problema ? (
                    <Vacio titulo="No pudimos cargar el mercado" texto={problema} />
                ) : listings.length === 0 ? (
                    <Vacio
                        titulo={conFiltros ? 'Nada coincide con esos filtros' : 'Todavía no hay activos publicados'}
                        texto={
                            conFiltros
                                ? 'Probá ampliar el rango de precio o sacar el filtro de tipo.'
                                : 'Sé el primero: publicá tu canal, sitio o cuenta y recibí ofertas con la plata protegida por la plataforma.'
                        }
                        accion={
                            conFiltros ? (
                                <BotonEnlace href="/listings" variante="secundario">Limpiar filtros</BotonEnlace>
                            ) : (
                                <BotonEnlace href="/vender">Publicar mi activo</BotonEnlace>
                            )
                        }
                    />
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {listings.map((l, i) => (
                            <Revelar key={l.id} retraso={Math.min(i, 6) * 70}>
                                <TarjetaListing listing={l} />
                            </Revelar>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
