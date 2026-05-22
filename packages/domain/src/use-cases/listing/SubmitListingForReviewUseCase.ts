import { IListingRepository } from '../../ports/Repositories';
import { Listing } from '../../entities/Listing';

export class SubmitListingForReviewUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
    ) {}

    async execute(listingId: string): Promise<void> {
        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new Error('Listing no encontrado');
        }

        // La validación de estado vive en la entidad (Tell, Don't Ask)
        listing.submitForReview();

        await this.listingRepo.save(listing);
    }
}
