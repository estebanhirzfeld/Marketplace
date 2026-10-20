import {
    IListingRepository,
    IOperationRepository,
    ITransferStepProgressRepository,
} from '../../ports/Repositories';
import { IDomainRegistrar } from '../../ports/IDomainRegistrar';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { Operation } from '../../entities/Operation';
import { Listing } from '../../entities/Listing';
import { TransferStepProgress, TransferStepProgressStatus } from '../../entities/TransferStepProgress';
import { DomainName } from '../../value-objects/DomainName';
import { Email } from '../../value-objects/Email';
import { isWebListing, websiteDomainOf } from '../../services/WebCustody';
import { DOMAIN_TRANSFER_INVITATION_DAYS } from './CheckDomainCustodyUseCase';
import {
    DomainRegistrarRejectedError,
    InvalidStateError,
    NotFoundError,
    ValidationError,
} from '../../errors/DomainError';

/** La `key` del paso de `WebStrategy` que entrega el dominio al comprador. */
export const DOMAIN_TO_BUYER_STEP_KEY = 'domain-to-buyer';

const DAY_MS = 24 * 60 * 60 * 1000;

interface WebDelivery {
    operation: Operation;
    listing: Listing;
    domain: DomainName;
}

/** Carga la operación y su sitio, y exige el pago confirmado: la entrega viene después del cobro. */
async function loadWebDelivery(
    operationRepo: IOperationRepository,
    listingRepo: IListingRepository,
    operationId: string,
): Promise<WebDelivery> {
    const operation = await operationRepo.findById(operationId);
    if (!operation) {
        throw new NotFoundError('Operación no encontrada');
    }

    const listing = await listingRepo.findById(operation.listingId.toString());
    if (!listing) {
        throw new NotFoundError('Activo no encontrado');
    }
    if (!isWebListing(listing)) {
        throw new ValidationError('Esta operación no es de un sitio web.');
    }

    if (operation.status !== 'payment_received') {
        throw new InvalidStateError('La entrega del dominio empieza con el pago del comprador confirmado.');
    }

    return { operation, listing, domain: websiteDomainOf(listing) };
}

/**
 * Un admin inicia la entrega del dominio de un sitio al comprador.
 *
 * La plataforma es titular del dominio durante la custodia, así que la entrega
 * es un traslado saliente de su cuenta de Hostinger a la del comprador, al mail
 * que él declaró. Hostinger le manda la invitación y el comprador la acepta;
 * eso se ve después con `CheckDomainDeliveryUseCase`.
 *
 * El paso `domain-to-buyer` queda en `waiting` con el plazo de la invitación
 * (10 días desde que se inicia). Iniciarlo de nuevo con un traslado en curso no
 * hace nada; vencida la invitación, se puede volver a iniciar con un plazo
 * nuevo.
 *
 * La API de Hostinger no permite preguntar si un mail tiene cuenta: el rechazo
 * llega al iniciar el traslado, y se le devuelve al admin con un mensaje que
 * dice qué revisar.
 */
export class StartDomainDeliveryUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
        private readonly progressRepo: ITransferStepProgressRepository,
        private readonly registrar: IDomainRegistrar,
        /** El reloj entra por acá para poder fijarlo en los tests. */
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(operationId: string, actor: Actor): Promise<TransferStepProgressStatus> {
        assertIsAdmin(actor);

        const { operation, domain } = await loadWebDelivery(this.operationRepo, this.listingRepo, operationId);

        const declared = operation.recipientIdentity?.identifier;
        if (!declared) {
            throw new InvalidStateError('El comprador todavía no indicó el mail de su cuenta de Hostinger.');
        }
        let recipient: Email;
        try {
            recipient = Email.create(declared);
        } catch {
            // Una identidad declarada antes de que un sitio exigiera un mail.
            throw new ValidationError(
                'La cuenta que declaró el comprador no es un mail: tiene que corregirla con el mail de su cuenta de Hostinger.',
            );
        }

        const existing = await this.progressRepo.find('operation', operationId, DOMAIN_TO_BUYER_STEP_KEY);
        if (existing?.status === 'done') {
            return existing.status;
        }
        if (existing?.isOpen() && (await this.registrar.getOutgoingMove(domain))) {
            return existing.status;
        }

        if (!(await this.registrar.getPortfolioEntry(domain))) {
            throw new InvalidStateError('El dominio no está en la cuenta de la plataforma: no hay qué entregar.');
        }

        try {
            await this.registrar.startOutgoingMove(domain, recipient);
        } catch (error) {
            if (error instanceof DomainRegistrarRejectedError) {
                throw new DomainRegistrarRejectedError(
                    `Hostinger no aceptó el traslado a ${recipient.getValue()}: puede que ese mail no tenga una cuenta de Hostinger. Pedile al comprador que lo revise.`,
                );
            }
            throw error;
        }

        // Una fila nueva también cuando la anterior venció: el plazo es el de
        // esta invitación, no el de la que se perdió.
        const now = this.now();
        const progress = TransferStepProgress.start({
            scope: 'operation',
            scopeId: operationId,
            stepKey: DOMAIN_TO_BUYER_STEP_KEY,
            startedAt: now,
            deadlineAt: new Date(now.getTime() + DOMAIN_TRANSFER_INVITATION_DAYS * DAY_MS),
        });
        progress.markWaiting(now, { recipientEmail: recipient.getValue() });
        await this.progressRepo.save(progress);
        return progress.status;
    }
}

/**
 * Comprueba si el dominio ya llegó a la cuenta del comprador y deja anotado
 * cómo va el paso `domain-to-buyer`.
 *
 * Se cumple cuando Hostinger informa el traslado saliente como completado. Si
 * Hostinger ya no lo lista y el dominio salió de la cartera de la plataforma,
 * también: el traslado terminó y el registro se limpió.
 *
 * Sin actor porque lo dispara también el job periódico; la autorización la
 * hace quien lo invoca.
 */
export class CheckDomainDeliveryUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
        private readonly progressRepo: ITransferStepProgressRepository,
        private readonly registrar: IDomainRegistrar,
        /** El reloj entra por acá para poder fijarlo en los tests. */
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(operationId: string): Promise<TransferStepProgressStatus> {
        const { domain } = await loadWebDelivery(this.operationRepo, this.listingRepo, operationId);

        const progress = await this.progressRepo.find('operation', operationId, DOMAIN_TO_BUYER_STEP_KEY);
        // Sin entrega iniciada no hay nada que preguntar.
        if (!progress) return 'pending';
        if (progress.status === 'done' || progress.status === 'rejected') return progress.status;

        const now = this.now();
        const move = await this.registrar.getOutgoingMove(domain);

        if (move?.status === 'completed') {
            progress.markDone(now, { evidence: { moveStatus: move.status } });
            await this.progressRepo.save(progress);
            return progress.status;
        }
        if (!move && !(await this.registrar.getPortfolioEntry(domain))) {
            progress.markDone(now, { evidence: { leftPortfolio: true } });
            await this.progressRepo.save(progress);
            return progress.status;
        }

        if (progress.isOpen()) {
            progress.recordCheck(now);
            await this.progressRepo.save(progress);
        }
        return progress.status;
    }
}
