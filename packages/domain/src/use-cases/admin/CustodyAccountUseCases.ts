import {
    ICustodyAccountRepository,
    IListingRepository,
} from '../../ports/Repositories';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { CustodyAccount } from '../../entities/CustodyAccount';
import { NotFoundError } from '../../errors/DomainError';
import { AssetType } from '@marketplace/shared-types';

/**
 * ABM de las cuentas de custodia, desde el panel de administración.
 *
 * Un archivo por flujo, como `ReportUseCases` y `PaymentUseCases`. Todos abren
 * con `assertIsAdmin`: la cuenta de custodia es infraestructura de la
 * plataforma, no de una parte.
 *
 * Se construye el ABM completo y no se deja el alta en la semilla porque
 * registrar el acceso pasa a exigir una cuenta: un entorno sin sembrar se
 * quedaría sin ninguna y el flujo entero quedaría trabado.
 */

export interface CreateCustodyAccountInput {
    label: string;
    identifier: string;
    assetType: AssetType;
    notes?: string;
}

export class CreateCustodyAccountUseCase {
    constructor(private readonly custodyRepo: ICustodyAccountRepository) {}

    async execute(input: CreateCustodyAccountInput, actor: Actor): Promise<CustodyAccount> {
        assertIsAdmin(actor);

        const account = CustodyAccount.create({
            label: input.label,
            identifier: input.identifier,
            assetType: input.assetType,
            notes: input.notes,
        });

        await this.custodyRepo.save(account);
        return account;
    }
}

export interface UpdateCustodyAccountInput {
    label?: string;
    identifier?: string;
    assetType?: AssetType;
    notes?: string;
}

/**
 * Edita una cuenta. El cambio de `assetType` cruza a `Listing` para contar los
 * activos sostenidos: la entidad rechaza el cambio si hay al menos uno.
 */
export class UpdateCustodyAccountUseCase {
    constructor(
        private readonly custodyRepo: ICustodyAccountRepository,
        private readonly listingRepo: IListingRepository,
    ) {}

    async execute(id: string, input: UpdateCustodyAccountInput, actor: Actor): Promise<CustodyAccount> {
        assertIsAdmin(actor);

        const account = await this.custodyRepo.findById(id);
        if (!account) {
            throw new NotFoundError('Cuenta de custodia no encontrada');
        }

        if (input.label !== undefined) account.rename(input.label);
        if (input.identifier !== undefined) account.changeIdentifier(input.identifier);
        if (input.notes !== undefined) account.updateNotes(input.notes);

        if (input.assetType !== undefined && input.assetType !== account.assetType) {
            const held = await this.listingRepo.findHeldBy(id);
            account.changeAssetType(input.assetType, held.length);
        }

        await this.custodyRepo.save(account);
        return account;
    }
}

export class ActivateCustodyAccountUseCase {
    constructor(private readonly custodyRepo: ICustodyAccountRepository) {}

    async execute(id: string, actor: Actor): Promise<void> {
        assertIsAdmin(actor);

        const account = await this.custodyRepo.findById(id);
        if (!account) {
            throw new NotFoundError('Cuenta de custodia no encontrada');
        }

        account.activate();
        await this.custodyRepo.save(account);
    }
}

/**
 * Da de baja una cuenta. Cuenta primero los activos que sostiene —cruzando a
 * `Listing`— y le pasa el número a la entidad, que rechaza la baja si hay
 * alguno: quedarían sin quién los sostenga.
 */
export class DeactivateCustodyAccountUseCase {
    constructor(
        private readonly custodyRepo: ICustodyAccountRepository,
        private readonly listingRepo: IListingRepository,
    ) {}

    async execute(id: string, actor: Actor): Promise<void> {
        assertIsAdmin(actor);

        const account = await this.custodyRepo.findById(id);
        if (!account) {
            throw new NotFoundError('Cuenta de custodia no encontrada');
        }

        const held = await this.listingRepo.findHeldBy(id);
        account.deactivate(held.length);

        await this.custodyRepo.save(account);
    }
}

/** Una cuenta más cuántos activos sostiene ahora mismo. */
export interface CustodyAccountWithLoad {
    account: CustodyAccount;
    heldAssets: number;
}

/**
 * Lista las cuentas con el número de activos que sostiene cada una. Es el
 * mismo dato que necesita la baja, así que sale del mismo lugar.
 */
export class ListCustodyAccountsUseCase {
    constructor(
        private readonly custodyRepo: ICustodyAccountRepository,
        private readonly listingRepo: IListingRepository,
    ) {}

    async execute(actor: Actor): Promise<CustodyAccountWithLoad[]> {
        assertIsAdmin(actor);

        const accounts = await this.custodyRepo.findAll();

        return Promise.all(
            accounts.map(async (account) => ({
                account,
                heldAssets: (await this.listingRepo.findHeldBy(account.id.toString())).length,
            })),
        );
    }
}
