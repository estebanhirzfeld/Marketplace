import { IListingRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { NotFoundError } from '../../errors/DomainError';
import { PlatformNotifier } from '../../services/PlatformNotifier';

/**
 * El vendedor avisa que ya invitó a la plataforma.
 *
 * Es una declaración, no una constancia: el acceso lo confirma un admin con
 * `RegisterPlatformAccessUseCase`. Solo el dueño puede declararlo —un admin
 * confirma, no declara por el vendedor—.
 */
export class RequestPlatformAccessUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly avisos?: PlatformNotifier,
    ) {}

    async execute(listingId: string, actor: Actor): Promise<void> {
        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }

        listing.assertOwnedBy(actor.id);
        const yaAvisado = listing.platformAccessRequestedAt !== undefined;
        listing.requestPlatformAccess(new Date());

        await this.listingRepo.save(listing);
        // El pedido es idempotente: solo la primera vez le avisa a la plataforma.
        if (!yaAvisado && listing.platformAccessRequestedAt) await this.avisos?.platformAccessRequested(listing);
    }
}
