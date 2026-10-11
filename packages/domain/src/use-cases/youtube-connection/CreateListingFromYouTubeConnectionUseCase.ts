import { AssetType, UserRole } from '@marketplace/shared-types';
import { IListingRepository, IYouTubeConnectionRepository, ListingCurrency } from '../../ports/Repositories';
import { IYouTubeChannelListingFinder } from '../../ports/IYouTubeChannelListingFinder';
import { Actor } from '../../ports/Actor';
import { Listing, ListingStatus } from '../../entities/Listing';
import { createAssetStrategy } from '../../strategies/AssetStrategyFactory';
import { Money } from '../../value-objects/Money';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
import {
    ChannelAlreadyListedError,
    ForbiddenError,
    InvalidStateError,
    NotFoundError,
    ValidationError,
} from '../../errors/DomainError';

export interface CreateListingFromYouTubeConnectionInput {
    channelId: string;
    /** Lo que Google no sabe: el vendedor lo completa. */
    niche: string;
    hasNoFaceContent: boolean;
    askingPriceCents: number;
    currency: ListingCurrency;
}

export interface CreateListingFromYouTubeConnectionResult {
    listingId: string;
    /** Valuación sobre los datos verificados, en centavos de dólar. */
    estimatedPriceCents: number;
}

/** Con un activo en estos estados el canal ya está publicado. */
const ACTIVE_STATUSES: readonly ListingStatus[] = ['draft', 'under_review', 'published', 'in_operation'];

/**
 * Crea el activo (borrador) a partir de un canal conectado.
 *
 * Suscriptores, ingreso, país y monetizado salen de la lectura de Google, no
 * del vendedor; él solo aporta rubro, si el contenido es sin rostro, precio y
 * moneda. Como OAuth ya probó que controla el canal, la titularidad queda
 * verificada desde el nacimiento del activo.
 */
export class CreateListingFromYouTubeConnectionUseCase {
    constructor(
        private readonly connections: IYouTubeConnectionRepository,
        private readonly listings: IListingRepository,
        private readonly finder: IYouTubeChannelListingFinder,
    ) {}

    async execute(
        input: CreateListingFromYouTubeConnectionInput,
        actor: Actor,
    ): Promise<CreateListingFromYouTubeConnectionResult> {
        if (actor.role === UserRole.ADMIN) {
            throw new ForbiddenError('Un administrador no puede publicar activos.');
        }
        if (!Number.isInteger(input.askingPriceCents) || input.askingPriceCents <= 0) {
            throw new ValidationError('El precio pedido debe ser un monto positivo en centavos.');
        }

        const connection = await this.connections.findBySellerAndChannel(actor.id, input.channelId);
        if (!connection) {
            throw new NotFoundError('Ese canal no está conectado a tu cuenta. Conectalo primero.');
        }
        if (!connection.isActive()) {
            throw new InvalidStateError('La conexión con ese canal se desconectó. Volvé a conectarlo.');
        }

        const active = (await this.finder.findByChannelId(connection.channelId)).find((l) =>
            ACTIVE_STATUSES.includes(l.status),
        );
        if (active) {
            const isOwnedByActor = active.isOwnedBy(actor.id);
            throw new ChannelAlreadyListedError(
                'Ese canal ya está publicado.',
                isOwnedByActor,
                isOwnedByActor ? active.id.toString() : undefined,
            );
        }

        const reading = connection.lastSnapshot;
        const assetStrategy = createAssetStrategy(AssetType.YOUTUBE, {
            monthlyRevenueUsdCents: reading.monthlyRevenueCents(),
            subscribers: reading.subscribers,
            isMonetized: reading.isMonetized(),
            // 1 es el valor neutro de la fórmula; 0 sería "cayendo" y restaría múltiplo.
            growthFactor: 1,
            ...(reading.topCountry ? { audienceTopCountry: reading.topCountry } : {}),
            hasNoFaceContent: input.hasNoFaceContent,
            niche: input.niche,
            name: connection.channelTitle,
            channelUrl: `https://www.youtube.com/channel/${connection.channelId}`,
            verifiedFromYouTubeAt: reading.readAt.toISOString(),
        });

        const sellerId = new UniqueEntityID(actor.id);
        const listing = Listing.create({
            sellerId,
            assetStrategy,
            askingPrice: Money.fromCents(input.askingPriceCents, input.currency),
        });
        // El OAuth del vendedor prueba que controla el canal.
        listing.registerOwnershipVerification({
            verifiedBy: sellerId,
            assetId: connection.channelId,
            source: 'youtube',
        });

        await this.listings.save(listing);

        return {
            listingId: listing.id.toString(),
            estimatedPriceCents: listing.estimatedPrice.getCents(),
        };
    }
}
