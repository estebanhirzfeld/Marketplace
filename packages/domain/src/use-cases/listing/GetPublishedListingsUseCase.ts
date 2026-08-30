import { IListingRepository, ListingFilters } from '../../ports/Repositories';
import { Listing } from '../../entities/Listing';
import { AssetType } from '@marketplace/shared-types';
import { ValidationError } from '../../errors/DomainError';

export interface ListingSummaryView {
    id: string;
    status: string;
    assetType: string;
    askingPrice: { cents: number; currency: string };
    estimatedPrice: { cents: number; currency: string };
    assetData: Record<string, unknown>;
    hiddenFields: string[];
    transferable: boolean;
    transferableFrom?: Date;
    createdAt: Date;
    /** Cuándo salió al mercado. Distinta de `createdAt`: un listing puede
     *  pasar días en borrador o en revisión antes de publicarse. */
    publishedAt?: Date;
}

/**
 * El listado público del mercado.
 *
 * Existe para que la ruta `GET /listings` deje de leer el repositorio directo:
 * así saltaba el filtrado de los listings blind, y agregarle los datos del
 * activo habría publicado los campos confidenciales.
 *
 * Decisión deliberada: en la grilla los confidenciales NUNCA se revelan, ni
 * siquiera a quien firmó el NDA. Chequear el NDA por cada fila sería una
 * consulta por listing, y la grilla es una superficie para explorar — el
 * desbloqueo pertenece al detalle, que es donde el comprador se compromete.
 */
export class GetPublishedListingsUseCase {
    constructor(private readonly listingRepo: IListingRepository) {}

    async execute(filtros?: ListingFilters): Promise<ListingSummaryView[]> {
        assertFiltrosCoherentes(filtros);

        // SQL resuelve lo que tiene columna: estado, tipo, moneda y rango de
        // precio. Lo que depende de `assetData` o de un cálculo se filtra y
        // ordena acá. A la escala de este mercado el costo es despreciable; si
        // el catálogo creciera, el corte natural sería promover esos campos a
        // columnas antes que paginar sobre un filtrado en memoria.
        const listings = await this.listingRepo.findPublished(filtros);

        const filtrados = listings.filter((l) => cumpleCriteriosDelActivo(l, filtros));

        return ordenar(filtrados, filtros).map((listing) => {
            const { id, createdAt, props } = listing.toSnapshot();
            const data = listing.assetDataFor(false);

            return {
                id,
                status: props.status,
                assetType: data.assetType,
                askingPrice: {
                    cents: props.askingPrice.getCents(),
                    currency: props.askingPrice.getCurrency(),
                },
                estimatedPrice: {
                    cents: listing.estimatedPrice.getCents(),
                    currency: listing.estimatedPrice.getCurrency(),
                },
                    assetData: data.assetData,
                hiddenFields: data.hiddenFields,
                transferable: listing.isReadyToTransfer(),
                transferableFrom: listing.transferableFrom(),
                createdAt,
                publishedAt: props.publishedAt,
            };
        });
    }
}

/**
 * Un rango de precio sin moneda no significa nada: cien mil centavos de peso y
 * cien mil de dólar no son comparables. Y un filtro propio de un tipo de activo
 * aplicado sobre otro devolvería una lista vacía sin explicar por qué, que es
 * peor que rechazarlo.
 */
function assertFiltrosCoherentes(filtros?: ListingFilters): void {
    if (!filtros) return;

    const { minPrice, maxPrice, currency, assetType } = filtros;

    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
        throw new ValidationError('El precio mínimo no puede superar al máximo.');
    }
    if ((minPrice !== undefined || maxPrice !== undefined) && !currency) {
        throw new ValidationError('Elegí una moneda para poder filtrar por precio.');
    }

    const deYouTube = filtros.minSubscribers !== undefined || filtros.onlyMonetized !== undefined;
    if (deYouTube && assetType !== AssetType.YOUTUBE) {
        throw new ValidationError('Los filtros de suscriptores y monetización son de los canales de YouTube.');
    }

    if (filtros.minDomainAuthority !== undefined && assetType !== AssetType.WEB) {
        throw new ValidationError('El filtro de autoridad de dominio es de los sitios web.');
    }
}

/**
 * Los criterios que viven dentro de `assetData`.
 *
 * Se leen del lado del servidor y no salen en la respuesta: la vista sigue
 * entregando solo lo que `assetDataFor` deja pasar, así que filtrar por un
 * número no revela nada de un listing confidencial.
 */
function cumpleCriteriosDelActivo(listing: Listing, filtros?: ListingFilters): boolean {
    if (!filtros) return true;

    const { assetData } = listing.toSnapshot().props.assetStrategy.toJSON();
    const numero = (clave: string) =>
        typeof assetData[clave] === 'number' ? (assetData[clave] as number) : undefined;

    if (filtros.minSubscribers !== undefined) {
        const subs = numero('subscribers');
        if (subs === undefined || subs < filtros.minSubscribers) return false;
    }

    if (filtros.onlyMonetized && assetData.isMonetized !== true) return false;

    if (filtros.minDomainAuthority !== undefined) {
        const da = numero('domainAuthority');
        if (da === undefined || da < filtros.minDomainAuthority) return false;
    }

    return true;
}

function ordenar(listings: Listing[], filtros?: ListingFilters): Listing[] {
    const criterio = filtros?.sort ?? 'published';
    // Lo más nuevo y lo más caro primero es lo que se espera por defecto.
    const signo = (filtros?.direction ?? 'desc') === 'asc' ? 1 : -1;

    const valor = (l: Listing): number => {
        const { createdAt, props } = l.toSnapshot();

        switch (criterio) {
            case 'price':
                return props.askingPrice.getCents();
            case 'estimated':
                return l.estimatedPrice.getCents();
            case 'created':
                return createdAt.getTime();
            case 'published':
            default:
                // Un listing publicado siempre tiene fecha; el respaldo es por
                // si alguna fila vieja quedó sin ella.
                return (props.publishedAt ?? createdAt).getTime();
        }
    };

    return [...listings].sort((a, b) => (valor(a) - valor(b)) * signo);
}
