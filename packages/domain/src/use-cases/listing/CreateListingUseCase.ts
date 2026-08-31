import { IListingRepository, IUserRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { Listing } from '../../entities/Listing';
import { Money } from '../../value-objects/Money';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
import { createAssetStrategy } from '../../strategies/AssetStrategyFactory';
import { ForbiddenError, NotFoundError } from '../../errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

export interface CreateListingInput {
    assetType: string;
    assetData: Record<string, unknown>;
    askingPrice: { cents: number; currency: string };
}

/**
 * Crear un listing no exige KYC: nace en `draft` y no es visible para nadie.
 * Publicarlo sí lo exige — ese gate vive en SubmitListingForReview.
 *
 * Sí exige no ser el admin. La plataforma verifica la custodia de lo que se
 * vende, así que no puede además ser la vendedora.
 *
 * Recibe el activo en su forma serializada, no una IAssetStrategy ya armada.
 * Así la capa HTTP solo reenvía el body y la validación del activo queda en el
 * dominio, que es quien sabe qué tipos existen y qué campos requiere cada uno.
 */
export class CreateListingUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly userRepo: IUserRepository,
    ) {}

    async execute(input: CreateListingInput, actor: Actor): Promise<Listing> {
        if (actor.role === UserRole.ADMIN) {
            throw new ForbiddenError(
                'La plataforma no compra ni vende: verifica la custodia de las operaciones ' +
                'y no puede ser parte de ellas.',
            );
        }

        const seller = await this.userRepo.findById(actor.id);
        if (!seller) {
            throw new NotFoundError('Vendedor no encontrado');
        }

        // Lanza ValidationError si el tipo o los campos del activo no cierran.
        const assetStrategy = createAssetStrategy(input.assetType, input.assetData);

        const listing = Listing.create({
            sellerId: new UniqueEntityID(actor.id),
            assetStrategy,
            askingPrice: Money.fromCents(input.askingPrice.cents, input.askingPrice.currency),
        });

        await this.listingRepo.save(listing);

        return listing;
    }
}
