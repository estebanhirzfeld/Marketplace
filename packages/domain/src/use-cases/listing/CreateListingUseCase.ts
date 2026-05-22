import { IListingRepository } from '../../ports/Repositories';
import { IUserRepository } from '../../ports/Repositories';
import { Listing } from '../../entities/Listing';
import { Money } from '../../value-objects/Money';
import { IAssetStrategy } from '../../strategies/IAssetStrategy';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';

export interface CreateListingInput {
    sellerId: string;
    assetStrategy: IAssetStrategy;
    askingPrice: { cents: number; currency: string };
    isBlind: boolean;
}

export class CreateListingUseCase {
    constructor(
        private readonly listingRepo: IListingRepository,
        private readonly userRepo: IUserRepository,
    ) {}

    async execute(input: CreateListingInput): Promise<Listing> {
        // 1. Verificar que el seller existe
        const seller = await this.userRepo.findById(input.sellerId);
        if (!seller) {
            throw new Error('Seller no encontrado');
        }

        // 2. Crear el listing (dominio se encarga de validar)
        const listing = Listing.create({
            sellerId: new UniqueEntityID(input.sellerId),
            assetStrategy: input.assetStrategy,
            askingPrice: Money.fromCents(input.askingPrice.cents, input.askingPrice.currency),
            isBlind: input.isBlind,
        });

        // 3. Persistir
        await this.listingRepo.save(listing);

        return listing;
    }
}
