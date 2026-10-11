import { IListingRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { Money } from '../../value-objects/Money';
import { NotFoundError } from '../../errors/DomainError';

export interface EditListingInput {
    /** Rubro. Solo en borrador o rechazado. */
    niche?: string;
    /** Contenido sin rostro. Solo en borrador o rechazado, y solo canales. */
    hasNoFaceContent?: boolean;
    askingPrice?: { cents: number; currency: string };
}

/**
 * Edita un listing del propio vendedor.
 *
 * Si el pedido toca solo el precio va por `changePrice`, que además rige para
 * un activo publicado; cualquier otro campo va por `editDraft`, que lo rechaza
 * fuera de borrador. Las reglas viven en la entidad.
 */
export class EditListingUseCase {
    constructor(private readonly listingRepo: IListingRepository) {}

    async execute(listingId: string, input: EditListingInput, actor: Actor): Promise<void> {
        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }

        listing.assertOwnedBy(actor.id);

        const price = input.askingPrice
            ? Money.fromCents(input.askingPrice.cents, input.askingPrice.currency)
            : undefined;

        if (price && input.niche === undefined && input.hasNoFaceContent === undefined) {
            listing.changePrice(price);
        } else {
            listing.editDraft({
                niche: input.niche,
                hasNoFaceContent: input.hasNoFaceContent,
                askingPrice: price,
            });
        }

        await this.listingRepo.save(listing);
    }
}
