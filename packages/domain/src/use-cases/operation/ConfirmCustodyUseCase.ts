import { IOperationRepository, IListingRepository, ICustodyAccountRepository } from '../../ports/Repositories';
import { IDomainRegistrar } from '../../ports/IDomainRegistrar';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { NegotiationNotifier } from '../../services/NegotiationNotifier';
import { isWebListing, resolveCustodyAccountId, websiteDomainOf } from '../../services/WebCustody';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
import { NotFoundError } from '../../errors/DomainError';

export interface ConfirmCustodyInput {
    /**
     * Si la plataforma quedó como propietaria principal del activo. En un
     * sitio con registrador cableado se ignora: lo calcula el servidor.
     */
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
        private readonly listingRepo: IListingRepository,
        private readonly avisos?: NegotiationNotifier,
        /** Para resolver la cuenta de custodia de un sitio que no tiene `platformAccess`. */
        private readonly custodyRepo?: ICustodyAccountRepository,
        /**
         * Si está cableado, la propiedad principal de un sitio la dice el
         * registrador y no el admin: es la única señal que se puede comprobar.
         */
        private readonly registrar?: IDomainRegistrar,
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

        const listing = await this.listingRepo.findById(operation.listingId.toString());
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }

        // Con registrador, un sitio es propiedad principal de la plataforma si
        // el dominio está en su cartera; lo que mande el admin en ese campo se
        // ignora. Un error del registrador sube sin confirmar nada.
        const isPrimaryOwner = this.registrar && isWebListing(listing)
            ? (await this.registrar.getPortfolioEntry(websiteDomainOf(listing))) !== null
            : input.isPrimaryOwner;

        // La entidad rechaza declarar custodia sin propiedad principal ni
        // accesos asegurados. `custodyAccountId` sale del `platformAccess`
        // vigente del listing —congelado acá, igual que en
        // `InitiateTransferUseCase`— y no de lo que envíe quien llama: así
        // se puede comparar después contra la cuenta que el vendedor declaró
        // al ceder el control.
        operation.confirmAssetCustody({
            verifiedBy: new UniqueEntityID(actor.id),
            isPrimaryOwner,
            accessSecured: input.accessSecured,
            metrics: input.metrics,
            custodyAccountId: await resolveCustodyAccountId(listing, this.custodyRepo),
            notes: input.notes,
        });

        await this.operationRepo.save(operation);
        await this.avisos?.assetInCustody(operation);
    }
}
