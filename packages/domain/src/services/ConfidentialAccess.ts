import { IContractRepository } from '../ports/Repositories';
import { Actor } from '../ports/Actor';
import { Listing } from '../entities/Listing';
import { UserRole } from '@marketplace/shared-types';

/**
 * Quién puede ver los datos reservados de un activo.
 *
 * La regla vivía adentro de `GetListingDetailsUseCase` como método privado, y
 * cada pantalla nueva que necesitaba lo mismo —el nombre del activo en la
 * lista de operaciones, en su detalle— tenía que reimplementarla o quedarse
 * sin el dato. Una regla de confidencialidad copiada en tres lugares es una
 * regla que en algún momento va a divergir en uno de ellos.
 *
 * Son tres casos y ninguno es una excepción caprichosa:
 *
 *   · el vendedor, porque el activo es suyo;
 *   · la plataforma, porque su trabajo es comprobar la titularidad y atestiguar
 *     la custodia, y no puede hacerlo sin saber de qué activo se trata;
 *   · el comprador que firmó el acuerdo, que es exactamente lo que el acuerdo
 *     habilita.
 */
export class ConfidentialAccess {
    constructor(private readonly contractRepo: IContractRepository) {}

    async allowed(listing: Listing, actor?: Actor): Promise<boolean> {
        if (!actor) return false;
        if (listing.isOwnedBy(actor.id)) return true;
        if (actor.role === UserRole.ADMIN) return true;

        const contract = await this.contractRepo.findByListingAndSigner(
            listing.id.toString(),
            actor.id,
        );
        if (!contract) return false;

        return contract.type === 'buyer_nda' && contract.isFullySigned();
    }
}
