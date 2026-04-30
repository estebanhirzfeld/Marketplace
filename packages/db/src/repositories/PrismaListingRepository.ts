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

        // El mapper necesita assetType y assetData que vienen de la strategy.
        // Al guardar, necesitamos serializar la strategy.
        // Por ahora, usamos el assetType y assetData que ya están en el row si existe,
        // o los que se pasen externamente.
        const existing = await prisma.listing.findUnique({ where: { id } });

        const data = ListingMapper.toPersistence(
            listing,
            existing?.assetType ?? "youtube", // fallback — en producción vendría del use case
            existing?.assetData as Record<string, any> ?? {}
        );

        await prisma.listing.upsert({
            where: { id: data.id },
            create: data,
            update: data,
        });
    }
}
