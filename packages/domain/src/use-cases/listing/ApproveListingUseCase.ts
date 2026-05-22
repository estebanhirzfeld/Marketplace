import { IListingRepository } from '../../ports/Repositories';

export class ApproveListingUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
    ) {}

    async execute(listingId: string): Promise<void> {
        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new Error('Listing no encontrado');
        }

        listing.approve();

        await this.listingRepo.save(listing);
    }
}
