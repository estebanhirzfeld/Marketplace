import { IOperationRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { NotFoundError } from '../../errors/DomainError';

export interface DeclareRecipientIdentityInput {
    /** La cuenta donde el comprador quiere recibir el activo. */
    identifier: string;
}

/**
 * El comprador declara dónde quiere recibir el activo.
 *
 * Orquesta y nada más: carga la operación, delega en la entidad —que valida
 * que sea el comprador, el estado y el identificador— y guarda. La
 * autorización es por pertenencia, no por rol: `assertIsBuyer` la resuelve
 * contra la operación.
 */
export class DeclareRecipientIdentityUseCase {
    constructor(private readonly operationRepo: IOperationRepository) {}

    async execute(
        operationId: string,
        input: DeclareRecipientIdentityInput,
        actor: Actor,
    ): Promise<void> {
        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        operation.declareRecipientIdentity(input.identifier, actor.id);

        await this.operationRepo.save(operation);
    }
}
