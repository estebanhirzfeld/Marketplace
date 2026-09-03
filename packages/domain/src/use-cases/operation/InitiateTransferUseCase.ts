import { IOperationRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { PlatformNotifier } from '../../services/PlatformNotifier';
import { NotFoundError } from '../../errors/DomainError';

/**
 * Quien entrega el activo es el seller, así que solo él inicia la
 * transferencia. Se valida por pertenencia a ESTA operación, no por rol.
 */
export class InitiateTransferUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly avisosDePlataforma?: PlatformNotifier,
    ) {}

    async execute(operationId: string, actor: Actor): Promise<void> {
        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        operation.assertIsSeller(actor.id);

        operation.initiateTransfer();
        await this.operationRepo.save(operation);

        // A partir de acá el próximo movimiento es de la plataforma: verificar
        // el activo y declarar la custodia.
        await this.avisosDePlataforma?.custodyNeeded(operation);
    }
}
