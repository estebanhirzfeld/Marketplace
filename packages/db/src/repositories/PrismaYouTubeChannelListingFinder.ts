import { IYouTubeChannelListingFinder } from "@marketplace/domain/src/ports/IYouTubeChannelListingFinder";
import { Listing } from "@marketplace/domain/src/entities/Listing";
import { AssetType } from "@marketplace/shared-types";
import { prisma, PrismaLike } from "../client";
import { ListingMapper } from "../mappers/ListingMapper";

/** La dirección que escribe el alta desde una conexión; la identidad del canal. */
export function youTubeChannelUrl(channelId: string): string {
    return `https://www.youtube.com/channel/${channelId}`;
}

/**
 * Los activos de un canal, buscados por la URL `/channel/<id>` que guarda
 * `assetData`. Los activos cargados a mano con la URL de un handle no se
 * encuentran por acá: no tienen el id del canal.
 */
export class PrismaYouTubeChannelListingFinder implements IYouTubeChannelListingFinder {
    constructor(private readonly db: PrismaLike = prisma) {}

    async findByChannelId(channelId: string): Promise<Listing[]> {
        const rows = await this.db.listing.findMany({
            where: {
                assetType: AssetType.YOUTUBE as never,
                assetData: { path: ["channelUrl"], equals: youTubeChannelUrl(channelId) },
            },
            orderBy: { createdAt: "asc" },
        });
        return rows.map(ListingMapper.toDomain);
    }
}
