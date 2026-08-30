import { IListingRepository, ListingFilters } from '../../ports/Repositories';
import { ValidationError } from '../../errors/DomainError';

export interface ListingSummaryView {
    id: string;
    status: string;
    assetType: string;
    askingPrice: { cents: number; currency: string };
    estimatedPrice: { cents: number; currency: string };
    isBlind: boolean;
    assetData: Record<string, unknown>;
    hiddenFields: string[];
    createdAt: Date;
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
        if (
            filtros?.minPrice !== undefined &&
            filtros?.maxPrice !== undefined &&
            filtros.minPrice > filtros.maxPrice
        ) {
            throw new ValidationError('El precio mínimo no puede superar al máximo.');
        }

        const listings = await this.listingRepo.findPublished(filtros);

        return listings.map((listing) => {
            const { id, createdAt, props } = listing.toSnapshot();
            const datos = listing.datosDelActivo(false);

            return {
                id,
                status: props.status,
                assetType: datos.assetType,
                askingPrice: {
                    cents: props.askingPrice.getCents(),
                    currency: props.askingPrice.getCurrency(),
                },
                estimatedPrice: {
                    cents: listing.estimatedPrice.getCents(),
                    currency: listing.estimatedPrice.getCurrency(),
                },
                isBlind: props.isBlind,
                assetData: datos.assetData,
                hiddenFields: datos.hiddenFields,
                createdAt,
            };
        });
    }
}
