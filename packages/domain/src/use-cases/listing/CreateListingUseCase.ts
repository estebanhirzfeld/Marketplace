import { IListingRepository, IUserRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { Listing } from '../../entities/Listing';
import { Money } from '../../value-objects/Money';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
import { createAssetStrategy } from '../../strategies/AssetStrategyFactory';
import { NotFoundError } from '../../errors/DomainError';

export interface CreateListingInput {
    assetType: string;
    assetData: Record<string, unknown>;
    askingPrice: { cents: number; currency: string };
}

/**
 * Crear un listing no exige rol ni KYC: nace en `draft` y no es visible para
 * nadie. Publicarlo sí los exige — ese gate vive en SubmitListingForReview.
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
