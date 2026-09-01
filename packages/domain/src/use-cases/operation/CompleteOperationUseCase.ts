import { IOperationRepository, IListingRepository } from '../../ports/Repositories';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { NotFoundError } from '../../errors/DomainError';
import { NegotiationNotifier } from '../../services/NegotiationNotifier';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';

/**
 * Lo que la plataforma atestigua al entregar. `deliveredToIdentifier` no está:
 * la entidad lo copia de la identidad que el comprador declaró, porque dejar
 * que lo aporte quien llama permitiría entregar a un destino que el comprador
 * nunca eligió.
 */
export interface CompleteOperationInput {
    buyerIsPrimaryOwner: boolean;
    accessTransferred: boolean;
    sellerRemoved: boolean;
    notes?: string;
}

/**
 * Cierra la operación registrando la constancia de entrega, en un solo acto.
 *
 * No hay un use case aparte de registro ni un cierre sin constancia: un segundo
 * camino al estado terminal se saltearía la constancia, que es el agujero que
 * este cambio cierra.
 */
export class CompleteOperationUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
        private readonly avisos?: NegotiationNotifier,
    ) {}

    async execute(operationId: string, input: CompleteOperationInput, actor: Actor): Promise<void> {
        assertIsAdmin(actor);

        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        // La entidad valida el estado, la identidad receptora declarada y la
        // constancia (propiedad principal, accesos cedidos).
        operation.complete({
            verifiedBy: new UniqueEntityID(actor.id),
            buyerIsPrimaryOwner: input.buyerIsPrimaryOwner,
            accessTransferred: input.accessTransferred,
            sellerRemoved: input.sellerRemoved,
            notes: input.notes,
        });
        await this.operationRepo.save(operation);

        const { props } = operation.toSnapshot();
        const listing = await this.listingRepo.findById(props.listingId.toString());
        if (listing && listing.status === 'in_operation') {
            listing.markSold();
            await this.listingRepo.save(listing);
        }

        await this.avisos?.operationCompleted(operation);
    }
}
