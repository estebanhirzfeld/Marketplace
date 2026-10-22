import { IOperationRepository } from '../../ports/Repositories';
import { IFileStorage } from '../../ports/IFileStorage';
import { Actor } from '../../ports/Actor';
import { Operation, ReceiptDecision, ReceiptRecipient } from '../../entities/Operation';
import { NegotiationNotifier } from '../../services/NegotiationNotifier';
import { PlatformNotifier } from '../../services/PlatformNotifier';
import { HandoverDeadlines } from '../../value-objects/HandoverDeadlines';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

/** Un comprobante de transferencia no necesita más que esto. */
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

const INVALID_RECEIPT = 'El comprobante tiene que ser una imagen (JPG, PNG o WebP) o un PDF de hasta 5 MB.';

const SIGNATURES: { bytes: (number | null)[]; contentType: string; extension: string }[] = [
    { bytes: [0x25, 0x50, 0x44, 0x46], contentType: 'application/pdf', extension: 'pdf' },
    { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], contentType: 'image/png', extension: 'png' },
    { bytes: [0xff, 0xd8, 0xff], contentType: 'image/jpeg', extension: 'jpg' },
    // RIFF....WEBP
    { bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50], contentType: 'image/webp', extension: 'webp' },
];

/**
 * El tipo de un archivo por sus primeros bytes. El nombre y el tipo que manda
 * el navegador los elige quien sube: no prueban qué hay adentro.
 */
export function detectReceiptType(bytes: Uint8Array): { contentType: string; extension: string } | undefined {
    const match = SIGNATURES.find((s) => s.bytes.every((b, i) => b === null || bytes[i] === b));
    return match ? { contentType: match.contentType, extension: match.extension } : undefined;
}

async function loadOperation(repo: IOperationRepository, operationId: string): Promise<Operation> {
    const operation = await repo.findById(operationId);
    if (!operation) throw new NotFoundError('Operación no encontrada');
    return operation;
}

/** El comprador sube el comprobante de una de las dos transferencias. */
export class UploadPaymentReceiptUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly storage: IFileStorage,
        private readonly avisos?: NegotiationNotifier,
        private readonly avisosDePlataforma?: PlatformNotifier,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(operationId: string, recipient: ReceiptRecipient, bytes: Uint8Array, actor: Actor): Promise<void> {
        const operation = await loadOperation(this.operationRepo, operationId);
        operation.assertIsBuyer(actor.id);

        const type = detectReceiptType(bytes);
        if (!type || bytes.length > MAX_RECEIPT_BYTES) throw new ValidationError(INVALID_RECEIPT);

        const fileKey = `receipts/${operation.id.toString()}/${recipient}-${new UniqueEntityID().toString()}.${type.extension}`;
        operation.uploadReceipt(recipient, { fileKey, contentType: type.contentType, sizeBytes: bytes.length }, this.now());
        await this.storage.put(fileKey, bytes, type.contentType);
        await this.operationRepo.save(operation);

        if (recipient === 'seller') await this.avisos?.sellerReceiptUploaded(operation);
        else await this.avisosDePlataforma?.commissionReceiptUploaded(operation);
    }
}

/**
 * Quien recibió la plata confirma o rechaza el comprobante: el vendedor el
 * suyo, la plataforma la comisión. Si el vendedor no responde a tiempo,
 * decide la plataforma con el comprobante a la vista.
 */
export class DecidePaymentReceiptUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly deadlines: HandoverDeadlines = new HandoverDeadlines(),
        private readonly avisos?: NegotiationNotifier,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(operationId: string, recipient: ReceiptRecipient, decision: ReceiptDecision, actor: Actor): Promise<void> {
        const operation = await loadOperation(this.operationRepo, operationId);
        const now = this.now();
        this.assertCanDecide(operation, recipient, actor, now);

        operation.decideReceipt(recipient, decision, new UniqueEntityID(actor.id), now);
        await this.operationRepo.save(operation);

        if (!decision.confirm) await this.avisos?.receiptRejected(operation);
        else if (operation.status === 'payment_received') await this.avisos?.paymentConfirmed(operation);
    }

    private assertCanDecide(operation: Operation, recipient: ReceiptRecipient, actor: Actor, now: Date): void {
        const isAdmin = actor.role === UserRole.ADMIN;
        if (recipient === 'platform') {
            if (!isAdmin) throw new ForbiddenError('El comprobante de la comisión lo confirma la plataforma.');
            return;
        }
        if (!isAdmin) {
            operation.assertIsSeller(actor.id);
            return;
        }
        const receipt = operation.paymentReceipts.find((r) => r.recipient === 'seller');
        const sellerDeadline = receipt && this.deadlines.sellerTransferConfirmation(receipt.uploadedAt);
        if (!sellerDeadline || now.getTime() <= sellerDeadline.getTime()) {
            throw new ForbiddenError('El comprobante de lo que recibió el vendedor lo confirma el vendedor, salvo que no responda a tiempo.');
        }
    }
}

/** El archivo de un comprobante: lo ven el comprador, la plataforma y el vendedor el suyo. */
export class GetPaymentReceiptFileUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly storage: IFileStorage,
    ) {}

    async execute(operationId: string, recipient: ReceiptRecipient, actor: Actor): Promise<{ bytes: Uint8Array; contentType: string }> {
        const operation = await loadOperation(this.operationRepo, operationId);
        if (actor.role !== UserRole.ADMIN) {
            const party = operation.partyFor(actor.id);
            if (party === 'seller' && recipient !== 'seller') {
                throw new ForbiddenError('Ese comprobante no es tuyo.');
            }
        }

        const receipt = operation.paymentReceipts.find((r) => r.recipient === recipient);
        const stored = receipt && (await this.storage.get(receipt.fileKey));
        if (!stored) throw new NotFoundError('Comprobante no encontrado');
        return stored;
    }
}
