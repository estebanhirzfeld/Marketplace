import { IOperationRepository } from '../../ports/Repositories';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { NotFoundError } from '../../errors/DomainError';
import { AvisosDeNegociacion } from '../../services/AvisosDeNegociacion';

/**
 * Punto de control humano del escrow: la plataforma declara que recibió el
 * activo. Es lo que habilita el pago del buyer, así que solo un admin lo firma.
 */
export class ConfirmCustodyUseCase {
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

        operation.confirmAssetCustody();
        await this.operationRepo.save(operation);
        await this.avisos?.activoEnCustodia(operation);
    }
}
