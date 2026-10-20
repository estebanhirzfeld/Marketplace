import {
    IListingRepository,
    IOperationRepository,
    ITransferStepProgressRepository,
} from '../../ports/Repositories';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { OperationStatus } from '../../entities/Operation';
import { TransferStepProgress, TransferStepProgressStatus } from '../../entities/TransferStepProgress';
import { InvalidStateError, NotFoundError, ValidationError } from '../../errors/DomainError';

/** Desde que el vendedor cedió el activo hasta antes de cerrar: es cuando se entregan esas cosas. */
const ATTESTABLE_IN: OperationStatus[] = ['transfer_in_progress', 'asset_in_custody', 'payment_received'];

/**
 * Un admin da por cumplido un paso declarado de la entrega.
 *
 * Los pasos `declared` de una operación —el hosting, el código, las cuentas
 * asociadas— no tienen una señal que se pueda consultar: el vendedor dice que
 * los dejó listos y la plataforma lo comprueba a mano. Esto deja la constancia
 * de quién lo comprobó y cuándo, en el mismo progreso por paso que usan los
 * pasos automáticos.
 *
 * Un paso `automatic` no se atestigua: lo cumple su señal (el dominio en la
 * cartera, el traslado al comprador). Dejar que una persona lo marque sería
 * abrir un segundo camino que se saltea la comprobación.
 *
 * Es idempotente: un paso ya cumplido no se vuelve a escribir y conserva a
 * quien lo atestiguó primero.
 */
export class AttestTransferStepUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
        private readonly progressRepo: ITransferStepProgressRepository,
        /** El reloj entra por acá para poder fijarlo en los tests. */
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(
        operationId: string,
        stepKey: string,
        actor: Actor,
        notes?: string,
    ): Promise<TransferStepProgressStatus> {
        assertIsAdmin(actor);

        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        const listing = await this.listingRepo.findById(operation.listingId.toString());
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }

        const step = listing.handoverSteps(undefined, 'operation').find((s) => s.key === stepKey);
        if (!step) {
            throw new ValidationError('Ese paso no es parte de la entrega de este activo.');
        }
        if (step.check !== 'declared') {
            throw new ValidationError('Este paso se comprueba solo: no se puede dar por cumplido a mano.');
        }

        if (!ATTESTABLE_IN.includes(operation.status)) {
            throw new InvalidStateError(
                'Todavía no hay entrega que atestiguar: el vendedor no cedió el activo.',
            );
        }

        const existing = await this.progressRepo.find('operation', operationId, stepKey);
        if (existing?.status === 'done') {
            return existing.status;
        }

        const now = this.now();
        const progress =
            existing ??
            TransferStepProgress.start({ scope: 'operation', scopeId: operationId, stepKey, startedAt: now });
        const limpias = notes?.trim();
        progress.markDone(now, { attestedBy: actor.id, evidence: limpias ? { notes: limpias } : {} });
        await this.progressRepo.save(progress);
        return progress.status;
    }
}
