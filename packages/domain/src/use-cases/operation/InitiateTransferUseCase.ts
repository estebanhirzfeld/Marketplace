import { IOperationRepository, IListingRepository, ICustodyAccountRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { PlatformNotifier } from '../../services/PlatformNotifier';
import { resolveCustodyAccountId } from '../../services/WebCustody';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
import { NotFoundError } from '../../errors/DomainError';

export interface InitiateTransferInput {
    /** El vendedor afirma haber cedido el control del activo. */
    controlCeded: boolean;
    notes?: string;
}

/**
 * Quien entrega el activo es el seller, así que solo él inicia la
 * transferencia. Se valida por pertenencia a ESTA operación, no por rol.
 *
 * Congela el `custodyAccountId` del `platformAccess` vigente del listing al
 * momento de la declaración (en un sitio sin `platformAccess`, el de la cuenta
 * de custodia web activa) — la entidad no sabe buscar un `Listing`, así que
 * este use case es quien cruza los dos agregados.
 */
export class InitiateTransferUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
        private readonly avisosDePlataforma?: PlatformNotifier,
        /** Para resolver la cuenta de custodia de un sitio que no tiene `platformAccess`. */
        private readonly custodyRepo?: ICustodyAccountRepository,
    ) {}

    async execute(operationId: string, input: InitiateTransferInput, actor: Actor): Promise<void> {
        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        operation.assertIsSeller(actor.id);

        const listing = await this.listingRepo.findById(operation.listingId.toString());
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }

        operation.initiateTransfer({
            declaredBy: new UniqueEntityID(actor.id),
            controlCeded: input.controlCeded,
            custodyAccountId: await resolveCustodyAccountId(listing, this.custodyRepo),
            notes: input.notes,
        });
        await this.operationRepo.save(operation);

        // A partir de acá el próximo movimiento es de la plataforma: verificar
        // el activo y declarar la custodia.
        await this.avisosDePlataforma?.custodyNeeded(operation);
    }
}
