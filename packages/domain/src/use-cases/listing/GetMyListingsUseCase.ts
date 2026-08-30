import { IListingRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { Listing } from '../../entities/Listing';

/**
 * Los listings del actor, en cualquier estado.
 *
 * No hay chequeo de pertenencia porque no hay nada que chequear: se consulta
 * por el id del actor, así que estructuralmente no puede devolver los de otro.
 */
export class GetMyListingsUseCase {
    constructor(private readonly listingRepo: IListingRepository) {}

    async execute(actor: Actor): Promise<Listing[]> {
        return this.listingRepo.findBySeller(actor.id);
    }
}
