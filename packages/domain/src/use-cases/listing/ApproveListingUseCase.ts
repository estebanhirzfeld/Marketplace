import { IListingRepository } from '../../ports/Repositories';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { NotFoundError } from '../../errors/DomainError';
import { AvisosDeNegociacion } from '../../services/AvisosDeNegociacion';

export class ApproveListingUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly avisos?: AvisosDeNegociacion,
    ) {}

    async execute(listingId: string, actor: Actor): Promise<void> {
        assertIsAdmin(actor);

        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new NotFoundError('Listing no encontrado');
        }

        listing.approve();

        await this.listingRepo.save(listing);
        await this.avisos?.listingRevisado(listing, true);
    }
}
