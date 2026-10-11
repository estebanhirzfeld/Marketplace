import { IListingRepository } from '../../ports/Repositories';
import { Actor, assertIsAdmin } from '../../ports/Actor';
import { NotFoundError } from '../../errors/DomainError';
import { NegotiationNotifier } from '../../services/NegotiationNotifier';

/**
 * El admin no encontró la invitación que el vendedor dice haber enviado.
 *
 * Sin esta salida el vendedor quedaba «verificando» para siempre. El activo
 * vuelve a pendiente y el vendedor recibe un aviso para que revise los pasos
 * y vuelva a tocar «Ya los invité».
 */
export class RejectPlatformAccessRequestUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly avisos?: NegotiationNotifier,
    ) {}

    async execute(listingId: string, actor: Actor): Promise<void> {
        assertIsAdmin(actor);

        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }

        listing.rejectPlatformAccessRequest();

        await this.listingRepo.save(listing);
        await this.avisos?.platformAccessNotFound(listing);
    }
}
