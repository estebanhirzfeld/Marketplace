import { IListingRepository, IUserRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { NotFoundError } from '../../errors/DomainError';

/**
 * Publicar es un acto con valor legal: expone el activo de una persona real al
 * mercado. Por eso exige KYC además de ser dueño del listing.
 *
 * El estado de KYC se lee del repositorio y no del Actor: un token emitido
 * antes de la verificación cargaría el flag desactualizado.
 */
export class SubmitListingForReviewUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly userRepo: IUserRepository,
    ) {}

    async execute(listingId: string, actor: Actor): Promise<void> {
        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }

        listing.assertOwnedBy(actor.id);

        const user = await this.userRepo.findById(actor.id);
        if (!user) {
            throw new NotFoundError('Usuario no encontrado');
        }
        user.assertCanSign();

        // La validación de estado vive en la entidad (Tell, Don't Ask)
        listing.submitForReview();

        await this.listingRepo.save(listing);
    }
}
