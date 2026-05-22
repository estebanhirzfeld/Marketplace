import { IOperationRepository, IListingRepository } from '../../ports/Repositories';
import { Operation } from '../../entities/Operation';
import { Money } from '../../value-objects/Money';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';

export interface CreateOfferInput {
    listingId: string;
    buyerId: string;
    offerPrice: { cents: number; currency: string };
}

export class CreateOfferUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
    ) {}

    async execute(input: CreateOfferInput): Promise<Operation> {
        // 1. Verificar que el listing existe y está publicado
        const listing = await this.listingRepo.findById(input.listingId);
        if (!listing) {
            throw new Error('Listing no encontrado');
        }
        if (listing.status !== 'published') {
            throw new Error('Solo se puede ofertar sobre listings publicados');
        }

        // 2. Verificar que el buyer no sea el seller
        const { props } = listing.toSnapshot();
        if (props.sellerId.toString() === input.buyerId) {
            throw new Error('No podés ofertar sobre tu propio listing');
        }

        // 3. Crear la operación (dominio inicializa negotiations)
        const operation = Operation.create({
            listingId: new UniqueEntityID(input.listingId),
            buyerId: new UniqueEntityID(input.buyerId),
            sellerId: props.sellerId,
            offerPrice: Money.fromCents(input.offerPrice.cents, input.offerPrice.currency),
        });

        // 4. Persistir
        await this.operationRepo.save(operation);

        return operation;
    }
}
