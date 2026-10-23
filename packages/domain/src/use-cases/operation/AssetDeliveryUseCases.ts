import { IListingRepository, IOperationRepository, IReportRepository } from '../../ports/Repositories';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { Operation } from '../../entities/Operation';
import { NegotiationNotifier } from '../../services/NegotiationNotifier';
import { isWebListing } from '../../services/WebCustody';
import { HandoverDeadlines } from '../../value-objects/HandoverDeadlines';
import { InvalidStateError, NotFoundError } from '../../errors/DomainError';

/*
 * La entrega de un canal. Con el pago confirmado, la plataforma invita al
 * comprador a la cuenta de marca; el comprador acepta; cumplidos los días que
 * exige Google, la plataforma lo hace propietario principal, que es la
 * entrega; y el comprador confirma la recepción, o se da por recibida al
 * vencer su plazo salvo que haya abierto un reclamo.
 */

async function loadOperation(repo: IOperationRepository, operationId: string): Promise<Operation> {
    const operation = await repo.findById(operationId);
    if (!operation) throw new NotFoundError('Operación no encontrada');
    return operation;
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

/** El comprador confirma que recibió el canal: «Confirmar la recepción». */
export class ConfirmAssetReceiptUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly avisos?: NegotiationNotifier,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(operationId: string, actor: Actor): Promise<void> {
        const operation = await loadOperation(this.operationRepo, operationId);
        operation.confirmAssetReceipt(actor.id, this.now());
        await this.operationRepo.save(operation);
        await this.avisos?.assetReceived(operation);
    }
}

export interface AssetReceiptsSummary {
    /** Recepciones dadas por confirmadas al vencer el plazo. */
    deemed: number;
    /** Vencidas pero frenadas por un reclamo abierto del comprador. */
    frozen: number;
    /** Operaciones que fallaron en esta corrida; la próxima las vuelve a intentar. */
    failed: number;
}

/**
 * La corrida horaria: vencido el plazo del comprador sin respuesta, la
 * recepción se da por confirmada. Un reclamo abierto porque el activo no se
 * entregó la frena: con un reclamo, el silencio no es conformidad.
 */
export class DeemAssetReceivedUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly reportRepo: IReportRepository,
        private readonly avisos?: NegotiationNotifier,
        private readonly now: () => Date = () => new Date(),
        private readonly deadlines: HandoverDeadlines = new HandoverDeadlines(),
    ) {}

    async execute(): Promise<AssetReceiptsSummary> {
        const now = this.now();
        const summary: AssetReceiptsSummary = { deemed: 0, frozen: 0, failed: 0 };

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

    private isDue(operation: Operation, now: Date): boolean {
        if (operation.milestones.receivedAt) return false;
        const deadline = operation.assetReceiptDeadline(this.deadlines);
        return !!deadline && now.getTime() >= deadline.getTime();
    }

    private async process(operationId: string, now: Date, summary: AssetReceiptsSummary): Promise<void> {
        // Se vuelve a leer justo antes de decidir: entre el listado y acá el comprador pudo haber confirmado.
        const operation = await this.operationRepo.findById(operationId);
        if (!operation || !this.isDue(operation, now)) return;

        const reports = await this.reportRepo.findByOperation(operationId);
        if (reports.some((r) => r.status === 'open' && r.reason === 'activo_no_entregado')) {
            summary.frozen += 1;
            return;
        }

        if (!operation.deemAssetReceived(now, this.deadlines)) return;
        await this.operationRepo.save(operation);
        summary.deemed += 1;
        await this.avisos?.assetReceived(operation);
    }
}
