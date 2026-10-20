import { IOperationRepository, IListingRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { NotFoundError } from '../../errors/DomainError';

export interface DeclareRecipientIdentityInput {
    /** La cuenta donde el comprador quiere recibir el activo. */
    identifier: string;
}

/**
 * El comprador declara dónde quiere recibir el activo.
 *
 * Carga la operación, comprueba el identificador contra el tipo de activo y
 * delega en la entidad —que valida que sea el comprador, el estado y que el
 * dato no venga vacío— y guarda.
 *
 * La comprobación del formato cruza dos agregados: la regla depende del tipo de
 * activo, que vive en el `Listing`, y la `Operation` solo conoce su `listingId`.
 * Igual que el congelado de la cuenta de custodia en `InitiateTransferUseCase`,
 * ese cruce se resuelve acá y a la entidad le llega un hecho ya resuelto: el
 * identificador normalizado. Acá no hay ninguna decisión por tipo de activo —
 * `Listing` delega en su estrategia y este caso de uso ni se entera de cuál es.
 */
export class DeclareRecipientIdentityUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
    ) {}

    async execute(
        operationId: string,
        input: DeclareRecipientIdentityInput,
        actor: Actor,
    ): Promise<void> {
        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        // Antes de tocar el listing: si el actor no es el comprador, no tiene
        // por qué enterarse de nada más de esta operación.
        operation.assertIsBuyer(actor.id);

        const listing = await this.listingRepo.findById(operation.listingId.toString());
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }

        operation.declareRecipientIdentity(
            listing.normalizeRecipientIdentifier(input.identifier),
            actor.id,
        );

        await this.operationRepo.save(operation);
    }
}
