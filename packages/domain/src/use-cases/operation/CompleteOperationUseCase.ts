import { IOperationRepository, IListingRepository } from '../../ports/Repositories';

export class CompleteOperationUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
    ) {}

    async execute(operationId: string): Promise<void> {
        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new Error('Operación no encontrada');
        }

        // 1. Completar la operación (dominio valida estado)
        operation.complete();
        await this.operationRepo.save(operation);

        // 2. Marcar el listing como vendido
        const { props } = operation.toSnapshot();
        const listing = await this.listingRepo.findById(props.listingId.toString());
        if (listing && listing.status === 'in_operation') {
            listing.markSold();
            await this.listingRepo.save(listing);
        }
    }
}
