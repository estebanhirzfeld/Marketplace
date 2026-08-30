import { IOperationRepository, IListingRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { Operation } from '../../entities/Operation';
import { NotFoundError } from '../../errors/DomainError';

/**
 * Solo el dueño del listing ve las ofertas. Esto preserva el carácter de
 * licitación a sobre cerrado: un buyer no puede espiar las ofertas rivales.
 */
export class GetSellerOffersUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
    ) {}

    async execute(listingId: string, actor: Actor): Promise<Operation[]> {
        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new NotFoundError('Listing no encontrado');
        }

        listing.assertOwnedBy(actor.id);

        const operations = await this.operationRepo.findByListing(listingId);

        // Filtrar solo las activas (no canceladas, no completadas)
        return operations.filter(op =>
            op.status !== 'cancelled' && op.status !== 'completed'
        );
    }
}
