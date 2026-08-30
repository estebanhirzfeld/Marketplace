import { IOperationRepository, IContractRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { Operation, NegotiatingParty } from '../../entities/Operation';
import { Contract } from '../../entities/Contract';
import { NotFoundError } from '../../errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

export interface OperationDetailView {
    operation: Operation;
    /** Qué posición ocupa quien consulta. `undefined` para un admin ajeno. */
    miParte?: NegotiatingParty;
    contratos: Contract[];
}

/**
 * Detalle de una operación.
 *
 * Solo la ven sus partes — y un admin, porque los pasos de custodia y pago son
 * suyos y necesita el contexto para ejecutarlos.
 */
export class GetOperationDetailsUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly contractRepo: IContractRepository,
    ) {}

    async execute(operationId: string, actor: Actor): Promise<OperationDetailView> {
        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        let miParte: NegotiatingParty | undefined;
        if (actor.role === UserRole.ADMIN) {
            // Un admin puede no ser parte; entra por rol, sin posición propia.
            try {
                miParte = operation.partyFor(actor.id);
            } catch {
                miParte = undefined;
            }
        } else {
            // Lanza ForbiddenError si el actor es un tercero.
            miParte = operation.partyFor(actor.id);
        }

        const contratos = await this.contractRepo.findByOperation(operationId);

        return { operation, miParte, contratos };
    }
}
