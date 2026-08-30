import { IOperationRepository, IListingRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { Operation } from '../../entities/Operation';
import { Money } from '../../value-objects/Money';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
import { ForbiddenError, InvalidStateError, NotFoundError } from '../../errors/DomainError';
import { NegotiationNotifier } from '../../services/NegotiationNotifier';

export interface CreateOfferInput {
    listingId: string;
    offerPrice: { cents: number; currency: string };
}

/**
 * Ofertar no exige rol: cualquiera autenticado puede hacerlo, y al hacerlo pasa
 * a ser el buyer de esa operación. Lo único prohibido es ofertar sobre el
 * propio listing.
 */
export class CreateOfferUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
        private readonly avisos?: NegotiationNotifier,
    ) {}

    async execute(input: CreateOfferInput, actor: Actor): Promise<Operation> {
        const listing = await this.listingRepo.findById(input.listingId);
        if (!listing) {
            throw new NotFoundError('Listing no encontrado');
        }
        if (listing.status !== 'published') {
            throw new InvalidStateError('Solo se puede ofertar sobre listings publicados');
        }

        if (listing.isOwnedBy(actor.id)) {
            throw new ForbiddenError('No podés ofertar sobre tu propio listing');
        }

        const { props } = listing.toSnapshot();

        const operation = Operation.create({
            listingId: new UniqueEntityID(input.listingId),
            buyerId: new UniqueEntityID(actor.id),
            sellerId: props.sellerId,
            offerPrice: Money.fromCents(input.offerPrice.cents, input.offerPrice.currency),
        });

        await this.operationRepo.save(operation);
        await this.avisos?.offerReceived(operation);

        return operation;
    }
}
