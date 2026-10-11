import {
    IListingRepository,
    ISellerPaymentAccountRepository,
    IUserRepository,
} from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { PublishingRequirements } from '../../services/PublishingRequirements';
import { NotFoundError } from '../../errors/DomainError';

/**
 * Publica sin revisión un activo cuya titularidad ya comprobó la fuente.
 *
 * Exige lo mismo que enviar a revisión (dueño, KYC, Mercado Pago si la
 * exigencia está encendida): cambia quién aprueba, no quién puede vender.
 * Que la titularidad esté comprobada lo decide la entidad.
 */
export class PublishListingUseCase {
    private readonly requirements: PublishingRequirements;

    constructor(
        private readonly listingRepo: IListingRepository,
        userRepo: IUserRepository,
        paymentAccounts?: ISellerPaymentAccountRepository,
    ) {
        this.requirements = new PublishingRequirements(userRepo, paymentAccounts);
    }

    async execute(listingId: string, actor: Actor): Promise<void> {
        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }

        listing.assertOwnedBy(actor.id);
        await this.requirements.assertMetBy(actor);

        listing.publish();

        await this.listingRepo.save(listing);
    }
}
