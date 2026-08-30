import { IOperationRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { NotFoundError } from '../../errors/DomainError';

export class CancelOperationUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
    ) {}

    async execute(operationId: string, actor: Actor): Promise<void> {
        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        // Cualquiera de las dos partes puede cancelar; un tercero no.
        operation.partyFor(actor.id);

        // Validación de estado cancelable vive en la entidad
        operation.cancel();

        await this.operationRepo.save(operation);
    }
}
