import { IOperationRepository, IListingRepository } from '../../ports/Repositories';
import { NegotiatingParty } from '../../entities/Operation';

export class AcceptOfferUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
    ) {}

    async execute(operationId: string, by: NegotiatingParty): Promise<void> {
        // 1. Buscar la operación
        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new Error('Operación no encontrada');
        }

        // 2. Aceptar (dominio valida turno y estado)
        operation.acceptCurrentOffer(by);
        await this.operationRepo.save(operation);

        // 3. Cascada híbrida: cancelar las demás ofertas del mismo listing
        const { props } = operation.toSnapshot();
        const allOps = await this.operationRepo.findByListing(props.listingId.toString());

        for (const op of allOps) {
            if (op.id.toString() !== operationId && op.status !== 'cancelled') {
                op.cancel();
                await this.operationRepo.save(op);
            }
        }

        // 4. Transicionar el listing a in_operation
        const listing = await this.listingRepo.findById(props.listingId.toString());
        if (listing && listing.status === 'published') {
            listing.markInOperation();
            await this.listingRepo.save(listing);
        }
    }
}
