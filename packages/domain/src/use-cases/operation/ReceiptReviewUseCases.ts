import { IOperationRepository } from '../../ports/Repositories';
import { IFileStorage } from '../../ports/IFileStorage';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { CoherenceResolution, Operation, ReceiptRecipient } from '../../entities/Operation';
import { NegotiationNotifier } from '../../services/NegotiationNotifier';
import { PlatformNotifier } from '../../services/PlatformNotifier';
import { HandoverDeadlines } from '../../value-objects/HandoverDeadlines';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors/DomainError';
import { UserRole } from '@marketplace/shared-types';
import { detectReceiptType, MAX_RECEIPT_BYTES } from './PaymentReceiptUseCases';

/*
 * La revisión de un comprobante rechazado. Ningún documento de las partes es
 * prueba: la plataforma revisa la coherencia del comprobante, el vendedor
 * responde en su plazo, y la plataforma resuelve con el rastreo entre bancos.
 * Si el vendedor calla ante un comprobante coherente, el pago se da por
 * acreditado: la prueba de que no llegó la tiene él.
 */

async function loadOperation(repo: IOperationRepository, operationId: string): Promise<Operation> {
    const operation = await repo.findById(operationId);
    if (!operation) throw new NotFoundError('Operación no encontrada');
    return operation;
}

function assertIsBuyer(operation: Operation, actor: Actor): void {
    if (operation.buyerId.toString() !== actor.id) {
        throw new ForbiddenError('La revisión de un comprobante la solicita el comprador.');
    }
}

/** El comprador pide que la plataforma revise un comprobante que le rechazaron. */
export class RequestReceiptReviewUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly avisosDePlataforma?: PlatformNotifier,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(operationId: string, recipient: ReceiptRecipient, input: { bankReference?: string }, actor: Actor): Promise<void> {
        const operation = await loadOperation(this.operationRepo, operationId);
        assertIsBuyer(operation, actor);

        operation.requestReceiptReview(recipient, input, this.now());
        await this.operationRepo.save(operation);
        await this.avisosDePlataforma?.receiptReviewNeeded(operation);
    }
}

/** El comprador suma el ID COELSA o el número de operación cuando su banco se lo da. */
export class AddReviewBankReferenceUseCase {
    constructor(private readonly operationRepo: IOperationRepository) {}

    async execute(operationId: string, recipient: ReceiptRecipient, bankReference: string, actor: Actor): Promise<void> {
        const operation = await loadOperation(this.operationRepo, operationId);
        assertIsBuyer(operation, actor);

        operation.addReviewBankReference(recipient, bankReference);
        await this.operationRepo.save(operation);
    }
}

/**
 * La plataforma revisa la coherencia del comprobante con las cuentas y los
 * CUIT. Coherente, el vendedor tiene su plazo para responder; incoherente, se
 * rechaza y el comprador recibe el motivo.
 */
export class ResolveReceiptCoherenceUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly deadlines: HandoverDeadlines = new HandoverDeadlines(),
        private readonly avisos?: NegotiationNotifier,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(operationId: string, recipient: ReceiptRecipient, resolution: CoherenceResolution, actor: Actor): Promise<void> {
        assertIsAdmin(actor);
        const operation = await loadOperation(this.operationRepo, operationId);
        const now = this.now();
        const sellerDeadline = this.deadlines.sellerTransferConfirmation(now);

        operation.resolveReceiptCoherence(recipient, resolution, new UniqueEntityID(actor.id), sellerDeadline, now);
        await this.operationRepo.save(operation);

        if (!resolution.coherent) await this.avisos?.receiptRejected(operation);
        else if (recipient === 'seller') await this.avisos?.receiptReviewAwaitingSeller(operation, sellerDeadline);
    }
}

/** El vendedor adjunta los movimientos de su cuenta del día: se suman a la revisión. */
export class AttachSellerStatementUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly storage: IFileStorage,
        private readonly avisosDePlataforma?: PlatformNotifier,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(operationId: string, bytes: Uint8Array, actor: Actor): Promise<void> {
        const operation = await loadOperation(this.operationRepo, operationId);
        operation.assertIsSeller(actor.id);

        const type = detectReceiptType(bytes);
        if (!type || bytes.length > MAX_RECEIPT_BYTES) {
            throw new ValidationError('Los movimientos tienen que ser una imagen (JPG, PNG o WebP) o un PDF de hasta 5 MB.');
        }

        const fileKey = `statements/${operation.id.toString()}/seller-${new UniqueEntityID().toString()}.${type.extension}`;
        operation.attachSellerStatement('seller', { fileKey, contentType: type.contentType, sizeBytes: bytes.length }, this.now());
        await this.storage.put(fileKey, bytes, type.contentType);
        await this.operationRepo.save(operation);
        await this.avisosDePlataforma?.receiptReviewNeeded(operation);
    }
}

/** La plataforma resuelve con el rastreo entre bancos si el pago se acreditó. */
export class ResolveReceiptReviewUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly avisos?: NegotiationNotifier,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(operationId: string, recipient: ReceiptRecipient, resolution: { credited: boolean }, actor: Actor): Promise<void> {
        assertIsAdmin(actor);
        const operation = await loadOperation(this.operationRepo, operationId);

        operation.resolveReceiptReview(recipient, resolution, new UniqueEntityID(actor.id), this.now());
        await this.operationRepo.save(operation);

        await this.avisos?.receiptReviewResolved(operation);
        if (operation.status === 'payment_received') await this.avisos?.paymentConfirmed(operation);
    }
}

export interface ReceiptReviewsSummary {
    reminded: number;
    confirmed: number;
    /** Operaciones que fallaron en esta corrida; la próxima las vuelve a intentar. */
    failed: number;
}

/**
 * La corrida horaria: le recuerda al vendedor que su plazo vence, y vencido
 * sin respuesta ante un comprobante coherente, da el pago por acreditado.
 */
export class ExpireReceiptReviewsUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly avisos?: NegotiationNotifier,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(): Promise<ReceiptReviewsSummary> {
        const now = this.now();
        const summary: ReceiptReviewsSummary = { reminded: 0, confirmed: 0, failed: 0 };

        for (const listed of await this.operationRepo.findByStatuses(['asset_in_custody'])) {
            if (!listed.hasOpenReceiptReview) continue;
            try {
                await this.process(listed.id.toString(), now, summary);
            } catch {
                // Una operación que falla no deja sin recordatorio ni vencimiento a las demás; la próxima corrida la reintenta.
                summary.failed += 1;
            }
        }
        return summary;
    }

    private async process(operationId: string, now: Date, summary: ReceiptReviewsSummary): Promise<void> {
        // Se vuelve a leer justo antes de decidir: entre el listado y acá el vendedor pudo haber respondido.
        const operation = await this.operationRepo.findById(operationId);
        if (!operation || !operation.hasOpenReceiptReview) return;
        const reminded = operation.remindReceiptReviews(now);
        const confirmed = operation.expireReceiptReviews(now);
        if (reminded.length === 0 && confirmed.length === 0) return;

        await this.operationRepo.save(operation);
        summary.reminded += reminded.length;
        summary.confirmed += confirmed.length;

        for (const _ of reminded) {
            const deadline = operation.paymentReceipts.find((r) => r.recipient === 'seller')?.review?.sellerDeadline;
            if (deadline) await this.avisos?.receiptReviewAwaitingSeller(operation, deadline);
        }
        if (confirmed.length > 0) {
            await this.avisos?.receiptReviewResolved(operation);
            if (operation.status === 'payment_received') await this.avisos?.paymentConfirmed(operation);
        }
    }
}

/** Los movimientos que adjuntó el vendedor: los ve la plataforma y el propio vendedor. */
export class GetSellerStatementFileUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly storage: IFileStorage,
    ) {}

    async execute(operationId: string, actor: Actor): Promise<{ bytes: Uint8Array; contentType: string }> {
        const operation = await loadOperation(this.operationRepo, operationId);
        if (actor.role !== UserRole.ADMIN) operation.assertIsSeller(actor.id);

        const statement = operation.paymentReceipts.find((r) => r.recipient === 'seller')?.review?.sellerStatement;
        const stored = statement && (await this.storage.get(statement.fileKey));
        if (!stored) throw new NotFoundError('Movimientos no encontrados');
        return stored;
    }
}
