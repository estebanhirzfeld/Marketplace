import { IOperationRepository } from '../../ports/Repositories';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { NotFoundError } from '../../errors/DomainError';
import { NegotiationNotifier } from '../../services/NegotiationNotifier';

export interface ConfirmPaymentInput {
    method: string;
    amountCents: number;
    currency: string;
}

/**
 * Registra un pago que entró fuera de la pasarela —una transferencia bancaria—
 * y que por lo tanto solo una persona puede haber visto llegar.
 *
 * Los pagos de MercadoPago no pasan por acá: los confirma el webhook contra la
 * propia pasarela, sin que nadie los toque a mano.
 */
export class ConfirmPaymentUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly avisos?: NegotiationNotifier,
    ) {}

    async execute(operationId: string, input: ConfirmPaymentInput, actor: Actor): Promise<void> {
        assertIsAdmin(actor);

        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        operation.confirmBuyerPayment({ ...input, provider: 'transferencia' });
        await this.operationRepo.save(operation);
        await this.avisos?.paymentConfirmed(operation);
    }
}
