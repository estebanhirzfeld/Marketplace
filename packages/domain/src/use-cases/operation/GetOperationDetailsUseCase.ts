import {
    IContractRepository,
    ICustodyAccountRepository,
    IListingRepository,
    IOperationRepository,
    ITransferStepProgressRepository,
    IUserRepository,
} from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { TransferStepProgressStatus } from '../../entities/TransferStepProgress';
import {
    Operation,
    NegotiatingParty,
    RecipientIdentity,
    DeliveryVerification,
} from '../../entities/Operation';
import { Contract } from '../../entities/Contract';
import { Listing, HandoverStep } from '../../entities/Listing';
import { TransferContext } from '../../strategies/IAssetStrategy';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
import { ConfidentialAccess } from '../../services/ConfidentialAccess';
import { isWebListing } from '../../services/WebCustody';
import { NotFoundError } from '../../errors/DomainError';
import { nextActions, NextActionsInput, NextActionsResult, PaymentAvailability } from '../../services/NextActions';
import { HandoverDeadlines } from '../../value-objects/HandoverDeadlines';
import { GetPaymentOptionsUseCase } from './GetPaymentOptionsUseCase';

import { UserRole } from '@marketplace/shared-types';

/** En qué está cada comprobante, para saber a quién le toca con el activo en custodia. */
function receiptFacts(operation: Operation): NextActionsInput['receipts'] {
    const byRecipient = (r: 'seller' | 'platform') => operation.paymentReceipts.find((x) => x.recipient === r);
    const seller = byRecipient('seller');
    const platform = byRecipient('platform');
    const inReview = [seller, platform].find((r) => r?.status === 'in_review' && r.review);
    return {
        seller: seller?.status,
        platform: platform?.status,
        sellerUploadedAt: seller?.uploadedAt,
        ...(inReview?.review
            ? {
                  review: {
                      recipient: inReview.recipient,
                      stage: inReview.review.stage,
                      sellerDeadline: inReview.review.sellerDeadline,
                      hasSellerStatement: !!inReview.review.sellerStatement,
                  },
              }
            : {}),
    };
}

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
    /** Solo para la plataforma: el DNI de la identidad verificada, para comprobar el CUIT de un comprobante. */
    verifiedDni?: string;
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
     * (`assertReadyToSign`), así que sin este dato la pantalla ofrecía
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

/** Cómo va un paso del traspaso, para mostrarlo con su estado y su plazo. */
export interface StepProgressView {
    stepKey: string;
    status: TransferStepProgressStatus;
    deadlineAt?: Date;
    /** Lo dio por cumplido una persona, y no una señal automática. */
    attested: boolean;
}

/**
 * La entrega de un canal: cuándo se invitó al comprador, cuándo aceptó, desde
 * cuándo se lo puede hacer propietario principal, cuándo lo fue (la entrega),
 * hasta cuándo confirma, y cuándo recibió.
 */
export interface AssetDeliveryView {
    buyerInvitedAt?: Date;
    invitationAcceptedAt?: Date;
    ownerFrom?: Date;
    deliveredAt?: Date;
    receiptDeadline?: Date;
    receivedAt?: Date;
    receivedBySilence: boolean;
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
    /** La entrega de un canal, desde que se invitó al comprador. */
    assetDelivery?: AssetDeliveryView;
    /**
     * Lo que le falta al vendedor ceder DESPUÉS de la firma —promovernos a
     * propietario principal en YouTube, o lo que enumere su estrategia—.
     * `undefined` sin `custodyRepo`, para no romper a quien construya este
     * use case sin él.
     */
    handoverSteps?: HandoverStep[];
    /**
     * Cómo va cada paso del traspaso que ya tiene progreso guardado: el
     * traslado del dominio, la entrega, los pasos atestiguados. Un paso sin
     * fila no aparece: está pendiente y sin plazo. No dice quién atestiguó,
     * porque nadie decide nada con ese dato.
     */
    stepProgress?: StepProgressView[];
    /**
     * Cómo se llaman las cuentas de custodia que las constancias congelaron.
     *
     * Las constancias guardan el identificador interno de la cuenta, que es lo
     * correcto para que la evidencia siga apuntando a la misma fila aunque el
     * correo cambie. Pero a una persona ese identificador no le dice nada: lo
     * que reconoce es la cuenta que invitó. Se resuelven las dos por separado
     * —la declarada por el vendedor y la verificada por la plataforma— porque
     * el sentido de mostrarlas es poder ver si difieren.
     *
     * Un nombre ausente con identificador presente significa que la cuenta ya
     * no está en el padrón, que no es lo mismo que no haberse registrado nunca.
     */
    custodyAccountNames?: { declared?: string; verified?: string };
    /** La próxima acción de cada rol, a quién le toca y la línea de tiempo común. */
    next: NextActionsResult;
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
        /** Opcional por la misma razón: sin él, `stepProgress` queda `undefined`. */
        private readonly progressRepo?: ITransferStepProgressRepository,
        /**
         * Los medios de pago, para saber a quién le toca con el activo en
         * custodia. Sin él, la próxima acción da el pago por no disponible.
         */
        private readonly paymentOptions?: GetPaymentOptionsUseCase,
        private readonly deadlines: HandoverDeadlines = new HandoverDeadlines(),
        /** El reloj: la espera de Google en la entrega de un canal termina en una fecha. */
        private readonly now: () => Date = () => new Date(),
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
            this.parte(props.buyerId.toString(), actor.role === UserRole.ADMIN),
            this.parte(props.sellerId.toString(), actor.role === UserRole.ADMIN),
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

        // Filtrado en el use case, no en la pantalla: acá solo la fase de
        // operación significa algo. `undefined` sin `custodyRepo`
        // — no hay forma de resolver el identificador de la cuenta.
        let handoverSteps: HandoverStep[] | undefined;
        if (this.custodyRepo && listing) {
            const contexto = await this.resolveContext(operation, listing);
            // Quitar el acceso directo y ceder la titularidad solo se piden con
            // la venta firmada y la espera de la plataforma ya cumplida: antes
            // Google rechazaría el cambio y el vendedor cedería control para nada.
            const firmada = !['offer_sent', 'negotiating', 'contract_pending', 'cancelled'].includes(
                operation.status,
            );
            // Un sitio no necesita `platformAccess` para recibir los pasos: su
            // custodia ocurre en la operación, no al publicar.
            handoverSteps =
                firmada && (listing.isReadyToTransfer() || isWebListing(listing))
                    ? listing.sellerSteps(contexto, 'operation')
                    : [];
        }

        let custodyAccountNames: { declared?: string; verified?: string } | undefined;
        if (this.custodyRepo) {
            const [declared, verified] = await Promise.all([
                this.nombreDeCuenta(operation.transferInitiation?.custodyAccountId),
                this.nombreDeCuenta(operation.custodyVerification?.custodyAccountId),
            ]);
            custodyAccountNames = { declared, verified };
        }

        const stepProgress = this.progressRepo
            ? (await this.progressRepo.findByScope('operation', operation.id.toString())).map(
                  (step): StepProgressView => ({
                      stepKey: step.stepKey,
                      status: step.status,
                      deadlineAt: step.deadlineAt,
                      attested: step.attestedBy !== undefined,
                  }),
              )
            : undefined;

        const next = nextActions({
            status: operation.status,
            assetType: listing?.describeAssetType().assetType ?? '',
            pendingResponseFrom: operation.pendingResponseFrom,
            contract: this.tripartiteFacts(contratos),
            // Un sitio se comprueba al firmar; un canal, con su acceso y su espera.
            signReady: !!listing && (!listing.requiresPlatformAccess() || listing.isReadyToTransfer()),
            platformAccessFrom: listing?.transferableFrom(),
            recipientDeclared: operation.recipientIdentity !== undefined,
            progress: (stepProgress ?? []).map(({ stepKey, status, deadlineAt }) => ({ stepKey, status, deadlineAt })),
            milestones: operation.milestones,
            payment: await this.paymentAvailability(operation, actor),
            receipts: receiptFacts(operation),
            completedAt: props.completedAt,
            deadlines: this.deadlines,
            now: this.now(),
        });

        return {
            operation,
            asset,
            miParte,
            contratos,
            buyer,
            seller,
            recipientIdentity: operation.recipientIdentity,
            deliveryCheck: operation.deliveryCheck,
            assetDelivery: this.assetDelivery(operation),
            handoverSteps,
            stepProgress,
            custodyAccountNames,
            next,
        };
    }

    private assetDelivery(operation: Operation): AssetDeliveryView | undefined {
        const m = operation.milestones;
        if (!m.buyerInvitedAt) return undefined;
        const view: AssetDeliveryView = { buyerInvitedAt: m.buyerInvitedAt, receivedBySilence: operation.receivedBySilence };
        if (m.invitationAcceptedAt) {
            view.invitationAcceptedAt = m.invitationAcceptedAt;
            view.ownerFrom = operation.buyerOwnershipFrom(this.deadlines);
        }
        if (m.deliveredAt) {
            view.deliveredAt = m.deliveredAt;
            view.receiptDeadline = operation.assetReceiptDeadline(this.deadlines);
        }
        if (m.receivedAt) view.receivedAt = m.receivedAt;
        return view;
    }

    private tripartiteFacts(contratos: Contract[]): NextActionsInput['contract'] {
        const tripartito = contratos.find((c) => c.type === 'tripartite');
        return {
            exists: tripartito !== undefined,
            signedBy: {
                buyer: tripartito?.hasSignedBy('buyer') ?? false,
                seller: tripartito?.hasSignedBy('seller') ?? false,
            },
        };
    }

    /** Solo con el activo en custodia: antes y después no hay nada que pagar. */
    private async paymentAvailability(operation: Operation, actor: Actor): Promise<PaymentAvailability | undefined> {
        if (operation.status !== 'asset_in_custody' || !this.paymentOptions) return undefined;
        try {
            const options = await this.paymentOptions.execute(operation.id.toString(), actor);
            return {
                mercadopago: { available: options.mercadopago.available, reason: options.mercadopago.reason },
                transfer: { available: options.transfer.available, reason: options.transfer.reason },
            };
        } catch {
            // Una cotización caída no puede dejar la operación sin abrir: se
            // informa como sin medios, y le toca a la plataforma.
            return undefined;
        }
    }

    /**
     * El nombre con el que una persona reconoce a una cuenta de custodia. Se
     * devuelve `undefined` tanto si no hay identificador como si la cuenta ya
     * no está: quien dibuja distingue los dos casos mirando si el identificador
     * venía o no.
     */
    private async nombreDeCuenta(id?: UniqueEntityID): Promise<string | undefined> {
        if (!id || !this.custodyRepo) return undefined;

        const cuenta = await this.custodyRepo.findById(id.toString());
        return cuenta?.identifier;
    }

    /**
     * Un usuario borrado no debería tumbar la operación: el historial y las
     * constancias siguen siendo válidos y la contraparte tiene derecho a
     * verlos. Se muestra sin nombre antes que fallar.
     */
    private async parte(userId: string, withVerifiedDni: boolean): Promise<OperationParty> {
        const user = await this.userRepo.findById(userId);
        const props = user?.toSnapshot().props;
        const verifiedDni = withVerifiedDni && props?.isKycVerified ? props.dni : undefined;
        return {
            id: userId,
            fullName: props?.fullName ?? 'Usuario dado de baja',
            ...(verifiedDni ? { verifiedDni } : {}),
        };
    }
}
