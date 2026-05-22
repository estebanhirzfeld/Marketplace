import { IOperationRepository } from '../../ports/Repositories';

export class ConfirmCustodyUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
    ) {}

    async execute(operationId: string): Promise<void> {
        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new Error('Operación no encontrada');
        }

        operation.confirmAssetCustody();
        await this.operationRepo.save(operation);
    }
}
