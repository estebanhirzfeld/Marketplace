import { IListingRepository, IOperationRepository, IReportRepository } from '../../ports/Repositories';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { Operation } from '../../entities/Operation';
import { NegotiationNotifier } from '../../services/NegotiationNotifier';
import { isWebListing } from '../../services/WebCustody';
import { HandoverDeadlines } from '../../value-objects/HandoverDeadlines';
import { InvalidStateError, NotFoundError } from '../../errors/DomainError';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
import { PLATFORM_ACTOR_ID } from './CheckDomainCustodyUseCase';

/*
 * La entrega de un canal. Con el pago confirmado, la plataforma invita al
 * comprador a la cuenta de marca; el comprador acepta; cumplidos los días que
 * exige Google, la plataforma lo hace propietario principal, que es la
 * entrega; y el comprador confirma la recepción, o se da por recibida al
 * vencer su plazo salvo que haya abierto un reclamo. Con la recepción, la
 * operación se cierra sola, salvo que un reclamo por la entrega siga abierto.
 */

async function loadOperation(repo: IOperationRepository, operationId: string): Promise<Operation> {
    const operation = await repo.findById(operationId);
    if (!operation) throw new NotFoundError('Operación no encontrada');
    return operation;
}

/** Un reclamo abierto porque el activo no se entregó frena el silencio y el cierre. */
async function hasOpenDeliveryClaim(reportRepo: IReportRepository, operationId: string): Promise<boolean> {
    const reports = await reportRepo.findByOperation(operationId);
    return reports.some((r) => r.status === 'open' && r.reason === 'activo_no_entregado');
}

/** Con la recepción hecha, cierra: la operación queda completada y el activo vendido. */
async function closeOnReceipt(
    operation: Operation,
    at: Date,
    repos: { operationRepo: IOperationRepository; listingRepo: IListingRepository },
    avisos?: NegotiationNotifier,
): Promise<void> {
    operation.closeOnReceipt(new UniqueEntityID(PLATFORM_ACTOR_ID), at);
    await repos.operationRepo.save(operation);

    const listing = await repos.listingRepo.findById(operation.listingId.toString());
    if (listing && listing.status === 'in_operation') {
        listing.markSold();
        await repos.listingRepo.save(listing);
    }
    await avisos?.operationCompleted(operation);
}

/** La plataforma invitó al comprador a la cuenta de marca: «Ya lo invité». */
export class MarkBuyerInvitedUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
        private readonly avisos?: NegotiationNotifier,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(operationId: string, actor: Actor): Promise<void> {
        assertIsAdmin(actor);
        const operation = await loadOperation(this.operationRepo, operationId);
        // Un sitio se entrega con el traslado del dominio, no con una invitación.
        const listing = await this.listingRepo.findById(operation.listingId.toString());
        if (!listing) throw new NotFoundError('Activo no encontrado');
        if (isWebListing(listing)) {
            throw new InvalidStateError('Solo un canal se entrega con una invitación a la cuenta de marca.');
        }

        operation.markBuyerInvited(this.now());
        await this.operationRepo.save(operation);
        await this.avisos?.buyerInvited(operation);
    }
}

/** El comprador aceptó la invitación: «Ya acepté la invitación». */
export class AcceptInvitationUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(operationId: string, actor: Actor): Promise<void> {
        const operation = await loadOperation(this.operationRepo, operationId);
        operation.acceptInvitation(actor.id, this.now());
        await this.operationRepo.save(operation);
    }
}

/** La plataforma hizo propietario principal al comprador: «Ya lo hice». Es la entrega. */
export class MakeBuyerOwnerUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly avisos?: NegotiationNotifier,
        private readonly deadlines: HandoverDeadlines = new HandoverDeadlines(),
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(operationId: string, actor: Actor): Promise<void> {
        assertIsAdmin(actor);
        const operation = await loadOperation(this.operationRepo, operationId);

        operation.makeBuyerOwner(this.now(), this.deadlines);
        await this.operationRepo.save(operation);

        const deadline = operation.assetReceiptDeadline(this.deadlines);
        if (deadline) await this.avisos?.buyerMadeOwner(operation, deadline);
    }
}

/**
 * El comprador confirma que recibió el canal: «Confirmar la recepción». Con
 * eso la operación se cierra en el acto, salvo un reclamo abierto.
 */
export class ConfirmAssetReceiptUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
        private readonly reportRepo: IReportRepository,
        private readonly avisos?: NegotiationNotifier,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(operationId: string, actor: Actor): Promise<void> {
        const operation = await loadOperation(this.operationRepo, operationId);
        const now = this.now();
        operation.confirmAssetReceipt(actor.id, now);
        await this.operationRepo.save(operation);
        await this.avisos?.assetReceived(operation);
        if (await hasOpenDeliveryClaim(this.reportRepo, operationId)) return;
        await closeOnReceipt(operation, now, { operationRepo: this.operationRepo, listingRepo: this.listingRepo }, this.avisos);
    }
}

export interface AssetReceiptsSummary {
    /** Recepciones dadas por confirmadas al vencer el plazo. */
    deemed: number;
    /** Operaciones cerradas en esta corrida, por silencio o con una recepción que esperaba. */
    completed: number;
    /** Frenadas por un reclamo abierto del comprador: ni silencio ni cierre. */
    frozen: number;
    /** Operaciones que fallaron en esta corrida; la próxima las vuelve a intentar. */
    failed: number;
}

/**
 * La corrida horaria: vencido el plazo del comprador sin respuesta, la
 * recepción se da por confirmada y la operación se cierra. Un reclamo abierto
 * porque el activo no se entregó la frena: con un reclamo, el silencio no es
 * conformidad. También cierra la recepción que esperaba a que se resolviera
 * un reclamo.
 */
export class DeemAssetReceivedUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
        private readonly reportRepo: IReportRepository,
        private readonly avisos?: NegotiationNotifier,
        private readonly now: () => Date = () => new Date(),
        private readonly deadlines: HandoverDeadlines = new HandoverDeadlines(),
    ) {}

    async execute(): Promise<AssetReceiptsSummary> {
        const now = this.now();
        const summary: AssetReceiptsSummary = { deemed: 0, completed: 0, frozen: 0, failed: 0 };

        for (const listed of await this.operationRepo.findByStatuses(['payment_received'])) {
            if (!this.isDue(listed, now)) continue;
            try {
                await this.process(listed.id.toString(), now, summary);
            } catch {
                // Una operación que falla no deja sin vencer a las demás; la próxima corrida la reintenta.
                summary.failed += 1;
            }
        }
        return summary;
    }

    /** Vencida sin respuesta, o recibida y todavía sin cerrar. */
    private isDue(operation: Operation, now: Date): boolean {
        if (operation.status !== 'payment_received') return false;
        if (operation.milestones.receivedAt) return true;
        const deadline = operation.assetReceiptDeadline(this.deadlines);
        return !!deadline && now.getTime() >= deadline.getTime();
    }

    private async process(operationId: string, now: Date, summary: AssetReceiptsSummary): Promise<void> {
        // Se vuelve a leer justo antes de decidir: entre el listado y acá el comprador pudo haber confirmado.
        const operation = await this.operationRepo.findById(operationId);
        if (!operation || !this.isDue(operation, now)) return;

        if (await hasOpenDeliveryClaim(this.reportRepo, operationId)) {
            summary.frozen += 1;
            return;
        }

        if (!operation.milestones.receivedAt) {
            if (!operation.deemAssetReceived(now, this.deadlines)) return;
            await this.operationRepo.save(operation);
            summary.deemed += 1;
            await this.avisos?.assetReceived(operation);
        }

        await closeOnReceipt(operation, now, { operationRepo: this.operationRepo, listingRepo: this.listingRepo }, this.avisos);
        summary.completed += 1;
    }
}
