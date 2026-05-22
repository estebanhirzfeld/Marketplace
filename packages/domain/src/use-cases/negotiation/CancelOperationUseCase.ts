import { IOperationRepository } from '../../ports/Repositories';

export class CancelOperationUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
    ) {}

    async execute(operationId: string): Promise<void> {
        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new Error('Operación no encontrada');
        }

        // Validación de estado cancelable vive en la entidad
        operation.cancel();

        await this.operationRepo.save(operation);
    }
}
