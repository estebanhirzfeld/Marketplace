import { ISellerBankAccountRepository, IUserRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { SellerBankAccount } from '../../entities/SellerBankAccount';
import { BankDestination } from '../../value-objects/BankDestination';
import { Cuit } from '../../value-objects/Cuit';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
import { ForbiddenError, ValidationError } from '../../errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

export interface DeclareSellerBankAccountInput {
    cbu?: string;
    alias?: string;
    holder: string;
    /** El CUIT o CUIL del titular. Tiene que ser el del DNI verificado del vendedor. */
    holderTaxId?: string;
    currency: string;
}

/**
 * El vendedor declara dónde cobrar por transferencia, una cuenta por moneda.
 * Declarar de nuevo la misma moneda la reemplaza.
 *
 * La cuenta tiene que estar a su nombre: si pudiera declarar la de otro, ante
 * un pago discutido podría decir que esa cuenta no es suya. El CUIT del
 * titular se compara con su DNI verificado.
 */
export class DeclareSellerBankAccountUseCase {
    constructor(
        private readonly repo: ISellerBankAccountRepository,
        private readonly users: IUserRepository,
    ) {}

    async execute(input: DeclareSellerBankAccountInput, actor: Actor): Promise<SellerBankAccount> {
        // El admin es un operador: no vende, así que no cobra.
        if (actor.role === UserRole.ADMIN) {
            throw new ForbiddenError('La plataforma no cobra ventas: no hay cuenta que declarar.');
        }

        if (!input.holderTaxId?.trim()) throw new ValidationError('Decinos el CUIT o CUIL del titular de la cuenta.');
        const destination = BankDestination.create(input);

        const dni = (await this.users.findById(actor.id))?.toSnapshot().props.dni;
        if (!dni) throw new ValidationError('Verificá tu identidad antes de declarar la cuenta donde cobrás.');
        if (!Cuit.create(input.holderTaxId).belongsTo(dni)) {
            throw new ValidationError('La cuenta tiene que estar a tu nombre: el CUIT no corresponde a tu identidad verificada.');
        }

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
