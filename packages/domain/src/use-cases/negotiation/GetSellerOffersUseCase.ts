import {
    IListingRepository,
    IOperationRepository,
    IUserRepository,
} from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { Operation } from '../../entities/Operation';
import { NotFoundError } from '../../errors/DomainError';

/**
 * Solo el dueño del listing ve las ofertas. Esto preserva el carácter de
 * licitación a sobre cerrado: un buyer no puede espiar las ofertas rivales.
 */
/** Una oferta con el nombre de quien la hizo. */
export interface SellerOfferView {
    operation: Operation;
    buyerName: string;
}

export class GetSellerOffersUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
        private readonly userRepo: IUserRepository,
    ) {}

    async execute(listingId: string, actor: Actor): Promise<SellerOfferView[]> {
        const listing = await this.listingRepo.findById(listingId);
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }

        listing.assertOwnedBy(actor.id);

        const operations = await this.operationRepo.findByListing(listingId);

        // Filtrar solo las activas (no canceladas, no completadas)
        const activas = operations.filter(
            (op) => op.status !== 'cancelled' && op.status !== 'completed',
        );

        // El nombre se resuelve acá y no en la pantalla: una tabla de ofertas
        // contra identificadores no se puede comparar. Un usuario dado de baja
        // no debe tumbar la lista.
        return Promise.all(
            activas.map(async (operation) => {
                const comprador = await this.userRepo.findById(
                    operation.toSnapshot().props.buyerId.toString(),
                );
                return {
                    operation,
                    buyerName: comprador?.toSnapshot().props.fullName ?? 'Usuario dado de baja',
                };
            }),
        );
    }
}
