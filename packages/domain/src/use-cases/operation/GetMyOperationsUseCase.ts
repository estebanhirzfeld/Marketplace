import { IOperationRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { Operation } from '../../entities/Operation';

/** Las operaciones donde el actor es parte, compre o venda. */
export class GetMyOperationsUseCase {
    constructor(private readonly operationRepo: IOperationRepository) {}

    async execute(actor: Actor): Promise<Operation[]> {
        return this.operationRepo.findByParty(actor.id);
    }
}
