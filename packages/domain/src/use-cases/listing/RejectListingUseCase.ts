import { IListingRepository } from '../../ports/Repositories';

export class RejectListingUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
    ) {}

    async execute(listingId: string, reason: string): Promise<void> {
        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new Error('Listing no encontrado');
        }

        // La validación de reason no-vacío vive en la entidad
        listing.reject(reason);

        await this.listingRepo.save(listing);
    }
}
