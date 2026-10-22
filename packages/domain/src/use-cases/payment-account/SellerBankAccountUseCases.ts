import { ISellerBankAccountRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { SellerBankAccount } from '../../entities/SellerBankAccount';
import { BankDestination } from '../../value-objects/BankDestination';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
import { ForbiddenError } from '../../errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

export interface DeclareSellerBankAccountInput {
    cbu?: string;
    alias?: string;
    holder: string;
    currency: string;
}

/**
 * El vendedor declara dónde cobrar por transferencia, una cuenta por moneda.
 * Declarar de nuevo la misma moneda la reemplaza.
 */
export class DeclareSellerBankAccountUseCase {
    constructor(private readonly repo: ISellerBankAccountRepository) {}

    async execute(input: DeclareSellerBankAccountInput, actor: Actor): Promise<SellerBankAccount> {
        // El admin es un operador: no vende, así que no cobra.
        if (actor.role === UserRole.ADMIN) {
            throw new ForbiddenError('La plataforma no cobra ventas: no hay cuenta que declarar.');
        }

        const destination = BankDestination.create(input);
        const existing = await this.repo.findByUserAndCurrency(actor.id, destination.currency);
        const account = existing ?? SellerBankAccount.declare({ userId: new UniqueEntityID(actor.id), destination });
        if (existing) existing.replace(destination);

        await this.repo.save(account);
        return account;
    }
}

/** Las cuentas que el vendedor declaró, para su perfil. */
export class GetSellerBankAccountsUseCase {
    constructor(private readonly repo: ISellerBankAccountRepository) {}

    async execute(actor: Actor): Promise<SellerBankAccount[]> {
        return this.repo.findByUser(actor.id);
    }
}
