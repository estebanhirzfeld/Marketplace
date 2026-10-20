import { ISellerPaymentAccountRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';

/** Lo que se puede mostrar de la cuenta: nunca los tokens. */
export type SellerPaymentAccountStatus =
    | { linked: false }
    | { linked: true; mpUserId: string; linkedAt: Date; expiresAt: Date; expired: boolean };

/**
 * Si el usuario tiene una cuenta de Mercado Pago vinculada y en qué estado.
 *
 * Un token vencido no desvincula: la cuenta sigue vinculada y se renueva al
 * cobrar. `expired` solo informa.
 */
export class GetSellerPaymentAccountStatusUseCase {
    constructor(
        private readonly accounts: ISellerPaymentAccountRepository,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(actor: Actor): Promise<SellerPaymentAccountStatus> {
        const account = await this.accounts.findByUserId(actor.id);
        if (!account) {
            return { linked: false };
        }

        return {
            linked: true,
            mpUserId: account.mpUserId,
            linkedAt: account.linkedAt,
            expiresAt: account.expiresAt,
            expired: account.isExpired(this.now()),
        };
    }
}
