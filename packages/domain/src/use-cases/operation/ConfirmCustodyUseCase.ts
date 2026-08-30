import { IOperationRepository } from '../../ports/Repositories';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { NegotiationNotifier } from '../../services/NegotiationNotifier';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
import { NotFoundError } from '../../errors/DomainError';

export interface ConfirmCustodyInput {
    /** Si la plataforma quedó como propietaria principal del activo. */
    isPrimaryOwner: boolean;
    /** Correos de recuperación, segundo factor y demás accesos bajo control. */
    accessSecured: boolean;
    /** Foto de las métricas al momento de la recepción. */
    metrics: Record<string, number>;
    notes?: string;
}

/**
 * Punto de control humano del escrow: la plataforma declara que recibió el
 * activo. Es lo que habilita el pago del comprador, así que solo un admin lo
 * firma — y desde ahora tiene que dejar constancia de qué verificó.
 *
 * Quién verifica sale del actor, no del input: nadie puede registrar una
 * verificación a nombre de otro.
 */
export class ConfirmCustodyUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly avisos?: NegotiationNotifier,
    ) {}

    async execute(
        operationId: string,
        input: ConfirmCustodyInput,
        actor: Actor,
    ): Promise<void> {
        assertIsAdmin(actor);

        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        // La entidad rechaza declarar custodia sin propiedad principal ni
        // accesos asegurados.
        operation.confirmAssetCustody({
            verifiedBy: new UniqueEntityID(actor.id),
            isPrimaryOwner: input.isPrimaryOwner,
            accessSecured: input.accessSecured,
            metrics: input.metrics,
            notes: input.notes,
        });

        await this.operationRepo.save(operation);
        await this.avisos?.assetInCustody(operation);
    }
}
