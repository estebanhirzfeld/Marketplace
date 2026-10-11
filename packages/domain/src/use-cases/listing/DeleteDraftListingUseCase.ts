import { IListingDeleter, IListingRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { NotFoundError } from '../../errors/DomainError';

/** Elimina un borrador (o rechazado) del propio vendedor. */
export class DeleteDraftListingUseCase {
    constructor(private readonly listings: IListingRepository & IListingDeleter) {}

    async execute(listingId: string, actor: Actor): Promise<void> {
        const listing = await this.listings.findById(listingId);
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }

        listing.assertOwnedBy(actor.id);
        listing.assertCanBeDiscarded();

        await this.listings.delete(listingId);
    }
}
