import { IListingRepository } from '../../ports/Repositories';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { NotFoundError } from '../../errors/DomainError';
import { NegotiationNotifier } from '../../services/NegotiationNotifier';

export class RejectListingUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly avisos?: NegotiationNotifier,
    ) {}

    async execute(listingId: string, reason: string, actor: Actor): Promise<void> {
        assertIsAdmin(actor);

        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }

        // La validación de reason no-vacío vive en la entidad
        listing.reject(reason);

        await this.listingRepo.save(listing);
        await this.avisos?.listingReviewed(listing, false);
    }
}
