import {
    IContractRepository,
    ICustodyAccountRepository,
    IListingRepository,
    IOperationRepository,
    IUserRepository,
} from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import {
    Operation,
    NegotiatingParty,
    RecipientIdentity,
    DeliveryVerification,
} from '../../entities/Operation';
import { Contract } from '../../entities/Contract';
import { Listing, HandoverStep } from '../../entities/Listing';
import { TransferContext } from '../../strategies/IAssetStrategy';
import { ConfidentialAccess } from '../../services/ConfidentialAccess';
import { NotFoundError } from '../../errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

/**
 * Quién está del otro lado.
 *
 * Se devuelve el nombre y no solo el identificador porque una negociación
 * contra un UUID es ilegible: el vendedor veía "tenés una oferta" sin saber de
 * quién, y el comprador negociaba contra nadie. No agrega exposición — el
 * contrato que las dos partes firman ya las nombra, y el legajo de un reclamo
 * también.
 */
export interface OperationParty {
    id: string;
    fullName: string;
}

/**
 * Con qué nombrar el activo de la operación.
 *
 * La pantalla lo identificaba con los primeros ocho caracteres de su UUID, que
 * no le dice nada a nadie. El tipo y el rubro son campos que la strategy
 * declara públicos, así que describen de qué se trata sin revelar cuál es:
 * eso sigue detrás del NDA.
 */
export interface OperationAsset {
    assetType: string;
    niche?: string;
    /**
     * Cómo se llama el activo. Ausente para quien no tiene acceso a los datos
     * reservados: el nombre identifica al activo tanto como su dirección.
     */
    name?: string;
    /**
     * Si el activo ya se puede transferir. Firmar el tripartito lo exige
     * (`assertCanBeTransferred`), así que sin este dato la pantalla ofrecía
     * firmar y el error aparecía recién al apretar el botón.
     */
    transferable: boolean;
    /**
     * Desde cuándo se va a poder. `undefined` mientras la plataforma no tenga
     * acceso al activo: sin acceso no hay fecha que prometerle a nadie, y lo
     * que falta es un movimiento de la plataforma, no del calendario.
     */
    transferableFrom?: Date;
}

export interface OperationDetailView {
    operation: Operation;
    /** Ausente si el activo ya no está; la operación sigue siendo válida. */
    asset?: OperationAsset;
    /** Qué posición ocupa quien consulta. `undefined` para un admin ajeno. */
    miParte?: NegotiatingParty;
    contratos: Contract[];
    buyer: OperationParty;
    seller: OperationParty;
    /** Dónde declaró el comprador que quiere recibir el activo. Tarea pendiente si falta. */
    recipientIdentity?: RecipientIdentity;
    /** La constancia de entrega, una vez cerrada la operación. */
    deliveryCheck?: DeliveryVerification;
    /**
     * Lo que le falta al vendedor ceder DESPUÉS de la firma —promovernos a
     * propietario principal en YouTube, o lo que enumere su estrategia—.
     * `undefined` sin `custodyRepo`, para no romper a quien construya este
     * use case sin él.
     */
    handoverSteps?: HandoverStep[];
}

/**
 * Detalle de una operación.
 *
 * Solo la ven sus partes — y un admin, porque los pasos de custodia y pago son
 * suyos y necesita el contexto para ejecutarlos.
 */
export class GetOperationDetailsUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly contractRepo: IContractRepository,
        private readonly userRepo: IUserRepository,
        private readonly listingRepo: IListingRepository,
        /**
         * Opcional para no romper a quien construya este use case sin él. Sin
         * `custodyRepo` no hay forma de resolver el identificador de la
         * cuenta a nombrar, así que `handoverSteps` queda `undefined`.
         */
        private readonly custodyRepo?: ICustodyAccountRepository,
    ) {}

    /**
     * La cuenta a nombrar en el paso de cesión:
     *   la que ya congeló `TransferInitiation` (a la que efectivamente se
     *   cedió el control)
     *   ─ si no hay ─
     *   la vigente en `platformAccess` del listing
     *   ─ si no hay ─
     *   la primera cuenta activa para el `AssetType` del listing.
     *
     * No es la misma política que `GetListingDetailsUseCase.resolveContext`:
     * ahí solo existe la cuenta vigente, porque todavía no hay ninguna cesión
     * declarada. Acá, una vez declarada, la operación tiene que nombrar la
     * cuenta a la que el vendedor efectivamente cedió — no la que hoy esté
     * asignada, si el acceso se volvió a registrar en el medio.
     */
    private async resolveContext(
        operation: Operation,
        listing: Listing,
    ): Promise<TransferContext | undefined> {
        if (!this.custodyRepo) return undefined;

        const declarada = operation.transferInitiation?.custodyAccountId;
        if (declarada) {
            const cuenta = await this.custodyRepo.findById(declarada.toString());
            if (cuenta) return { custodyAccountIdentifier: cuenta.identifier };
        }

        const vigente = listing.platformAccess?.custodyAccountId;
        if (vigente) {
            const cuenta = await this.custodyRepo.findById(vigente.toString());
            if (cuenta) return { custodyAccountIdentifier: cuenta.identifier };
        }

        const activas = await this.custodyRepo.findActive(listing.describeAssetType().assetType);
        if (activas.length > 0) {
            return { custodyAccountIdentifier: activas[0].identifier };
        }

        return undefined;
    }

    async execute(operationId: string, actor: Actor): Promise<OperationDetailView> {
        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        let miParte: NegotiatingParty | undefined;
        if (actor.role === UserRole.ADMIN) {
            // Un admin puede no ser parte; entra por rol, sin posición propia.
            try {
                miParte = operation.partyFor(actor.id);
            } catch {
                miParte = undefined;
            }
        } else {
            // Lanza ForbiddenError si el actor es un tercero.
            miParte = operation.partyFor(actor.id);
        }

        const contratos = await this.contractRepo.findByOperation(operationId);

        const { props } = operation.toSnapshot();
        const [buyer, seller, listing] = await Promise.all([
            this.parte(props.buyerId.toString()),
            this.parte(props.sellerId.toString()),
            this.listingRepo.findById(props.listingId.toString()),
        ]);

        // El nombre es un dato reservado, así que se filtra con la misma regla
        // que cualquier otro: el vendedor lo ve porque el activo es suyo, la
        // plataforma porque tiene que atestiguarlo, y el comprador si firmó.
        let asset: OperationAsset | undefined;
        if (listing) {
            const puedeVerTodo = await new ConfidentialAccess(this.contractRepo).allowed(
                listing,
                actor,
            );
            const { assetType, assetData } = listing.assetDataFor(puedeVerTodo);
            const name = typeof assetData.name === 'string' ? assetData.name : '';

            asset = {
                assetType,
                niche: typeof assetData.niche === 'string' ? assetData.niche : undefined,
                name: name || undefined,
                transferable: listing.isReadyToTransfer(),
                transferableFrom: listing.transferableFrom(),
            };
        }

        // Filtrado en el use case, no en la pantalla: acá solo el tramo
        // posterior a la firma significa algo. `undefined` sin `custodyRepo`
        // — no hay forma de resolver el identificador de la cuenta.
        let handoverSteps: HandoverStep[] | undefined;
        if (this.custodyRepo && listing) {
            const contexto = await this.resolveContext(operation, listing);
            handoverSteps = listing.handoverSteps(contexto).filter((p) => p.afterPlatformStarts);
        }

        return {
            operation,
            asset,
            miParte,
            contratos,
            buyer,
            seller,
            recipientIdentity: operation.recipientIdentity,
            deliveryCheck: operation.deliveryCheck,
            handoverSteps,
        };
    }

    /**
     * Un usuario borrado no debería tumbar la operación: el historial y las
     * constancias siguen siendo válidos y la contraparte tiene derecho a
     * verlos. Se muestra sin nombre antes que fallar.
     */
    private async parte(userId: string): Promise<OperationParty> {
        const user = await this.userRepo.findById(userId);
        return {
            id: userId,
            fullName: user?.toSnapshot().props.fullName ?? 'Usuario dado de baja',
        };
    }
}
