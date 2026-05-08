import { IListingRepository } from "@marketplace/domain/src/ports/Repositories";
import { Listing } from "@marketplace/domain/src/entities/Listing";
import { ListingMapper } from "../mappers/ListingMapper";
import { prisma } from "../client";

export class PrismaListingRepository implements IListingRepository {
    async findById(id: string): Promise<Listing | null> {
        const raw = await prisma.listing.findUnique({ where: { id } });
        return raw ? ListingMapper.toDomain(raw) : null;
    }

    async findPublished(filters?: any): Promise<Listing[]> {
        const rows = await prisma.listing.findMany({
            where: { status: "published", ...filters },
        });
        return rows.map(ListingMapper.toDomain);
    }

    async save(listing: Listing): Promise<void> {
        const { id, createdAt, props } = listing.toSnapshot();

        // Obtenemos assetType y assetData directo de la estrategia de dominio
        const strategyJson = listing.toSnapshot().props.assetStrategy.toJSON();

        const data = ListingMapper.toPersistence(
            listing,
            strategyJson.assetType,
            strategyJson.assetData
        );

        await prisma.listing.upsert({
            where: { id: data.id },
            create: data,
            update: data,
        });
    }
}
