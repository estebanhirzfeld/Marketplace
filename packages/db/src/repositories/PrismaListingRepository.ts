import { IListingRepository, ListingFilters } from "@marketplace/domain/src/ports/Repositories";
import { Listing, ListingStatus } from "@marketplace/domain/src/entities/Listing";
import { ListingMapper } from "../mappers/ListingMapper";
import { prisma, PrismaLike } from "../client";

export class PrismaListingRepository implements IListingRepository {
    /**
     * El cliente se inyecta para que el Unit of Work pueda pasar el cliente
     * transaccional. Por defecto usa el singleton, que es lo correcto para
     * una lectura o una escritura suelta.
     */
    constructor(private readonly db: PrismaLike = prisma) {}

    async findById(id: string): Promise<Listing | null> {
        const raw = await this.db.listing.findUnique({ where: { id } });
        return raw ? ListingMapper.toDomain(raw) : null;
    }

    async findPublished(filters?: ListingFilters): Promise<Listing[]> {
        // Cada criterio se traduce explícitamente. Antes se hacía spread del
        // objeto recibido, así que cualquier clave que llegara del cliente
        // terminaba en el `where` de Prisma.
        const precio: { gte?: number; lte?: number } = {};
        if (filters?.minPrice !== undefined) precio.gte = filters.minPrice;
        if (filters?.maxPrice !== undefined) precio.lte = filters.maxPrice;

        // El orden final lo decide el use case, porque uno de los criterios
        // —la proyección— se calcula y no está en ninguna columna. Acá se deja
        // uno estable para que el resultado no dependa del plan de Postgres.
        const rows = await this.db.listing.findMany({
            where: {
                status: "published",
                ...(filters?.assetType ? { assetType: filters.assetType as never } : {}),
                ...(filters?.currency ? { currency: filters.currency } : {}),
                ...(Object.keys(precio).length > 0 ? { askingPrice: precio } : {}),
            },
            orderBy: { createdAt: "desc" },
        });
        return rows.map(ListingMapper.toDomain);
    }

    async findBySeller(sellerId: string): Promise<Listing[]> {
        const rows = await this.db.listing.findMany({
            where: { sellerId },
            orderBy: { createdAt: "desc" },
        });
        return rows.map(ListingMapper.toDomain);
    }

    async findByStatus(status: ListingStatus): Promise<Listing[]> {
        const rows = await this.db.listing.findMany({
            where: { status },
            orderBy: { createdAt: "asc" },
        });
        return rows.map(ListingMapper.toDomain);
    }

    /**
     * Los activos que la cuenta sostiene AHORA. Excluye los vendidos: la
     * constancia se conserva como evidencia de la operación cerrada, pero la
     * plataforma ya no los tiene, así que no cuentan para el radio de daño de
     * perder la cuenta.
     */
    async findHeldBy(custodyAccountId: string): Promise<Listing[]> {
        const rows = await this.db.listing.findMany({
            where: {
                custodyAccountId,
                status: { not: "sold" },
            },
            orderBy: { createdAt: "asc" },
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

        await this.db.listing.upsert({
            where: { id: data.id },
            create: data,
            update: data,
        });
    }
}
