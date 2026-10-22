import { IOperationRepository } from '../../ports/Repositories';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { NegotiationNotifier } from '../../services/NegotiationNotifier';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
import { NotFoundError } from '../../errors/DomainError';

/**
 * Un admin rechaza la declaración de cesión del vendedor porque el activo no
 * llegó. La operación vuelve a «contrato firmado» y el vendedor recibe el
 * aviso con el motivo a la vista.
 */
export class RejectTransferUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly avisos?: NegotiationNotifier,
    ) {}

    async execute(operationId: string, reason: string, actor: Actor): Promise<void> {
        assertIsAdmin(actor);

        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        operation.rejectTransfer({ reason, rejectedBy: new UniqueEntityID(actor.id) });
        await this.operationRepo.save(operation);
        await this.avisos?.transferRejected(operation);
    }
}
