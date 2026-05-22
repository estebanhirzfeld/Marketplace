import { IOperationRepository } from '../../ports/Repositories';
import { Operation } from '../../entities/Operation';

export class GetSellerOffersUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
    ) {}

    async execute(listingId: string): Promise<Operation[]> {
        const operations = await this.operationRepo.findByListing(listingId);

        // Filtrar solo las activas (no canceladas, no completadas)
        return operations.filter(op =>
            op.status !== 'cancelled' && op.status !== 'completed'
        );
    }
}
