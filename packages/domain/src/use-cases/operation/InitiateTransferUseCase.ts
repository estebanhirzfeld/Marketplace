import { IOperationRepository } from '../../ports/Repositories';

export class InitiateTransferUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
    ) {}

    async execute(operationId: string): Promise<void> {
        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new Error('Operación no encontrada');
        }

        operation.initiateTransfer();
        await this.operationRepo.save(operation);
    }
}
