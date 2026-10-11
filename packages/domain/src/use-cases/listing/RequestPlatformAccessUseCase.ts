import { IListingRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { NotFoundError } from '../../errors/DomainError';

/**
 * El vendedor avisa que ya invitó a la plataforma.
 *
 * Es una declaración, no una constancia: el acceso lo confirma un admin con
 * `RegisterPlatformAccessUseCase`. Solo el dueño puede declararlo —un admin
 * confirma, no declara por el vendedor—.
 */
export class RequestPlatformAccessUseCase {
    constructor(private readonly listingRepo: IListingRepository) {}

    async execute(listingId: string, actor: Actor): Promise<void> {
        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }

        listing.assertOwnedBy(actor.id);
        listing.requestPlatformAccess(new Date());

        await this.listingRepo.save(listing);
    }
}
