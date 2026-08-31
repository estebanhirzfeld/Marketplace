import { IOperationRepository, IListingRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { Operation } from '../../entities/Operation';
import { Money } from '../../value-objects/Money';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
import { ForbiddenError, InvalidStateError, NotFoundError } from '../../errors/DomainError';
import { NegotiationNotifier } from '../../services/NegotiationNotifier';
import { UserRole } from '@marketplace/shared-types';

export interface CreateOfferInput {
    listingId: string;
    offerPrice: { cents: number; currency: string };
}

/**
 * Ofertar no exige un rol de comprador: cualquiera autenticado puede hacerlo, y
 * al hacerlo pasa a ser el buyer de esa operación. Hay dos prohibiciones —
 * ofertar sobre el propio listing, y ofertar siendo admin.
 */
export class CreateOfferUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly listingRepo: IListingRepository,
        private readonly avisos?: NegotiationNotifier,
    ) {}

    async execute(input: CreateOfferInput, actor: Actor): Promise<Operation> {
        // El admin es la parte que atestigua la custodia y el acceso al activo.
        // Si además pudiera comprar quedaría de los dos lados de una operación
        // que él mismo verifica.
        if (actor.role === UserRole.ADMIN) {
            throw new ForbiddenError(
                'La plataforma no compra ni vende: verifica la custodia de las operaciones ' +
                'y no puede ser parte de ellas.',
            );
        }

        const listing = await this.listingRepo.findById(input.listingId);
        if (!listing) {
            throw new NotFoundError('Activo no encontrado');
        }
        if (listing.status !== 'published') {
            throw new InvalidStateError('Solo se puede ofertar sobre activos publicados');
        }

        if (listing.isOwnedBy(actor.id)) {
            throw new ForbiddenError('No podés ofertar sobre tu propio activo');
        }

        // Una oferta viva por comprador y por activo.
        //
        // Sin esto cada envío abría una operación nueva, así que apretar el
        // botón cinco veces dejaba cinco negociaciones paralelas contra el
        // mismo vendedor: el vendedor no sabía cuál responder, la cascada al
        // aceptar cancelaba las otras cuatro del mismo comprador, y nada lo
        // impedía ni en la pantalla ni en la API. Para cambiar el monto está
        // la contraoferta, que además deja el historial a la vista.
        const enElActivo = await this.operationRepo.findByListing(input.listingId);
        const yaTiene = enElActivo.find((op) => op.hasBuyer(actor.id) && op.isLive());
        if (yaTiene) {
            throw new InvalidStateError(
                'Ya tenés una oferta abierta sobre este activo. ' +
                'Si querés cambiar el monto, contraofertá desde la operación.',
            );
        }

        const { props } = listing.toSnapshot();

        const operation = Operation.create({
            listingId: new UniqueEntityID(input.listingId),
            buyerId: new UniqueEntityID(actor.id),
            sellerId: props.sellerId,
            offerPrice: Money.fromCents(input.offerPrice.cents, input.offerPrice.currency),
        });

        await this.operationRepo.save(operation);
        await this.avisos?.offerReceived(operation);

        return operation;
    }
}
