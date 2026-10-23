import { IOperationRepository, IListingRepository } from '../../ports/Repositories';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { InvalidStateError, NotFoundError } from '../../errors/DomainError';
import { NegotiationNotifier } from '../../services/NegotiationNotifier';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
import { isWebListing } from '../../services/WebCustody';
import type { CheckDomainDeliveryUseCase } from './DomainDeliveryUseCases';

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
 * Es el cierre de un sitio: un canal se cierra solo con la recepción del
 * comprador (`ConfirmAssetReceiptUseCase`, `DeemAssetReceivedUseCase`).
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
        /**
         * Si está cableada, la propiedad principal del comprador en un sitio la
         * dice el registrador (el dominio llegó a su cuenta) y no el admin: es
         * la única señal que se puede comprobar. Igual que la custodia.
         */
        private readonly deliveryCheck?: Pick<CheckDomainDeliveryUseCase, 'execute'>,
    ) {}

    async execute(operationId: string, input: CompleteOperationInput, actor: Actor): Promise<void> {
        assertIsAdmin(actor);

        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        const listing = await this.listingRepo.findById(operation.listingId.toString());
        if (listing && !isWebListing(listing)) {
            throw new InvalidStateError('Un canal se cierra solo cuando el comprador confirma la recepción.');
        }

        // Un error del registrador sube sin cerrar nada. Solo con el pago
        // confirmado: en otro estado decide la guarda de la entidad, con su
        // mensaje de siempre.
        const buyerIsPrimaryOwner =
            this.deliveryCheck && listing && isWebListing(listing) && operation.status === 'payment_received'
                ? (await this.deliveryCheck.execute(operationId)) === 'done'
                : input.buyerIsPrimaryOwner;

        // La entidad valida el estado, la identidad receptora declarada y la
        // constancia (propiedad principal, accesos cedidos).
        operation.complete({
            verifiedBy: new UniqueEntityID(actor.id),
            buyerIsPrimaryOwner,
            accessTransferred: input.accessTransferred,
            sellerRemoved: input.sellerRemoved,
            notes: input.notes,
        });
        await this.operationRepo.save(operation);

        if (listing && listing.status === 'in_operation') {
            listing.markSold();
            await this.listingRepo.save(listing);
        }

        await this.avisos?.operationCompleted(operation);
    }
}
