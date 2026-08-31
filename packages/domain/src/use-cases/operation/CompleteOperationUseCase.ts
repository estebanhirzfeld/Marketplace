import { IOperationRepository, IListingRepository } from '../../ports/Repositories';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { NotFoundError } from '../../errors/DomainError';
import { NegotiationNotifier } from '../../services/NegotiationNotifier';

export class CompleteOperationUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
        private readonly avisos?: NegotiationNotifier,
    ) {}

    async execute(operationId: string, actor: Actor): Promise<void> {
        assertIsAdmin(actor);

        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
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

        await this.avisos?.operationCompleted(operation);
    }
}
