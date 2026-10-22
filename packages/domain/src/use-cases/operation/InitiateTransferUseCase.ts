import { IOperationRepository, IListingRepository, ICustodyAccountRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { PlatformNotifier } from '../../services/PlatformNotifier';
import { isWebListing, resolveCustodyAccountId } from '../../services/WebCustody';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
import { Email } from '../../value-objects/Email';
import { NotFoundError, ValidationError } from '../../errors/DomainError';

export interface InitiateTransferInput {
    /** El vendedor afirma haber cedido el control del activo. */
    controlCeded: boolean;
    notes?: string;
    /** En un sitio, el mail de la cuenta de Hostinger desde la que sale el dominio. */
    sellerSourceIdentity?: string;
}

/**
 * Sin la cuenta de origen, devolverle el dominio al vendedor si la operación
 * se cancela quedaría a cargo de una persona averiguándola.
 */
function sourceAccountOf(raw: string | undefined): string {
    if (!raw?.trim()) {
        throw new ValidationError(
            'Decinos el mail de la cuenta de Hostinger desde la que trasladás el dominio: ahí te lo devolvemos si la operación se cancela.',
        );
    }
    return Email.create(raw).getValue();
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
            sellerSourceIdentity: isWebListing(listing) ? sourceAccountOf(input.sellerSourceIdentity) : undefined,
        });
        await this.operationRepo.save(operation);

        // A partir de acá el próximo movimiento es de la plataforma: verificar
        // el activo y declarar la custodia.
        await this.avisosDePlataforma?.custodyNeeded(operation);
    }
}
