import { IOperationRepository } from '../../ports/Repositories';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { NotFoundError } from '../../errors/DomainError';
import { AvisosDeNegociacion } from '../../services/AvisosDeNegociacion';

export class ConfirmPaymentUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly avisos?: AvisosDeNegociacion,
    ) {}

    async execute(operationId: string, actor: Actor): Promise<void> {
        assertIsAdmin(actor);

        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        operation.confirmBuyerPayment();
        await this.operationRepo.save(operation);
        await this.avisos?.pagoConfirmado(operation);
    }
}
