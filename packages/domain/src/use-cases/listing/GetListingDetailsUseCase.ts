import { IListingRepository, IContractRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { ListingStatus } from '../../entities/Listing';
import { NotFoundError } from '../../errors/DomainError';

export interface ListingDetailView {
    id: string;
    status: ListingStatus;
    askingPrice: { cents: number; currency: string };
    estimatedPrice: { cents: number; currency: string };
    isBlind: boolean;
    /** Datos del activo — filtrados si es blind y no hay NDA */
    assetData: Record<string, any>;
    /** Qué campos están ocultos (para que el frontend sepa qué blurrear) */
    hiddenFields: string[];
    createdAt: Date;
}

/**
 * Lectura pública: el actor es opcional porque un visitante anónimo puede ver
 * un listing. Lo que cambia con el actor es cuánto ve — un listing blind revela
 * sus datos confidenciales solo a quien firmó el NDA, y siempre a su dueño.
 */
export class GetListingDetailsUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly contractRepo: IContractRepository,
    ) {}

    async execute(listingId: string, actor?: Actor): Promise<ListingDetailView> {
        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new NotFoundError('Listing no encontrado');
        }

        const { props } = listing.toSnapshot();

        // El filtrado lo decide la entidad: una sola regla, un solo lugar.
        const puedeVerTodo = await this.puedeVerTodo(
            listing.isOwnedBy(actor?.id ?? ''),
            listingId,
            actor,
        );
        const datos = listing.datosDelActivo(puedeVerTodo);

        return {
            id: listing.id.toString(),
            status: props.status,
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
            createdAt: listing.toSnapshot().createdAt,
        };
    }

    private async puedeVerTodo(
        esDuenio: boolean,
        listingId: string,
        actor?: Actor,
    ): Promise<boolean> {
        // El vendedor nunca necesita un NDA para ver su propio activo.
        if (esDuenio) return true;
        if (!actor) return false;

        const contract = await this.contractRepo.findByListingAndSigner(listingId, actor.id);
        if (!contract) return false;

        return contract.type === 'buyer_nda' && contract.isFullySigned();
    }
}
