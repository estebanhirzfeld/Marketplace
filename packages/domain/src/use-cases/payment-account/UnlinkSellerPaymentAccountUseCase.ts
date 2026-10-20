import { ISellerPaymentAccountRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';

/** Desvincula la cuenta de Mercado Pago del propio usuario. Idempotente. */
export class UnlinkSellerPaymentAccountUseCase {
    constructor(private readonly accounts: ISellerPaymentAccountRepository) {}

    async execute(actor: Actor): Promise<void> {
        await this.accounts.deleteByUserId(actor.id);
    }
}
