import { IListingRepository } from '../../ports/Repositories';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { Listing } from '../../entities/Listing';

/** Cola de revisión: lo que espera aprobación de la plataforma. */
export class GetListingsForReviewUseCase {
    constructor(private readonly listingRepo: IListingRepository) {}

    async execute(actor: Actor): Promise<Listing[]> {
        assertIsAdmin(actor);
        return this.listingRepo.findByStatus('under_review');
    }
}
