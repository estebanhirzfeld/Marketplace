import { IListingDeleter, IListingRepository, ListingFilters } from "@marketplace/domain/src/ports/Repositories";
import { Listing, ListingStatus } from "@marketplace/domain/src/entities/Listing";
import { ListingMapper } from "../mappers/ListingMapper";
import { centsToColumn } from "../mappers/moneyColumns";
import { prisma, PrismaLike } from "../client";
import { Prisma } from "../../generated/prisma/client";
import { ChannelAlreadyListedError } from "@marketplace/domain/src/errors/DomainError";

/** Nombre del índice único parcial que impide dos activos vigentes sobre un canal. */
export const ACTIVE_YOUTUBE_CHANNEL_INDEX = "listings_active_youtube_channel_key";

/**
 * Indica si el error es la violación del índice de canal vigente. Según el
 * motor, el nombre del índice viene en `meta.target`, en la restricción del
 * error del adaptador de driver o en su mensaje: se aceptan todas las formas.
 */
export function isActiveChannelConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        return false;
    }

    const meta = asRecord(error.meta);
    const cause = asRecord(asRecord(meta?.driverAdapterError)?.cause);
    const constraint = asRecord(cause?.constraint);

    return [meta?.target, constraint?.fields, constraint?.index, cause?.originalMessage]
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .some((value) => typeof value === "string" && value.includes(ACTIVE_YOUTUBE_CHANNEL_INDEX));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null
        ? Object.fromEntries(Object.entries(value))
        : undefined;
}

export class PrismaListingRepository implements IListingRepository, IListingDeleter {
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
        const precio: { gte?: bigint; lte?: bigint } = {};
        if (filters?.minPrice !== undefined) precio.gte = centsToColumn(filters.minPrice);
        if (filters?.maxPrice !== undefined) precio.lte = centsToColumn(filters.maxPrice);

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

    /**
     * Borra solo si sigue en borrador o rechazado: el estado se vuelve a
     * condicionar en la propia consulta, así un publicado nunca se pierde por
     * un pedido que leyó el estado viejo. Un id inexistente no es un error.
     */
    async delete(id: string): Promise<void> {
        await this.db.listing.deleteMany({
            where: { id, status: { in: ["draft", "rejected"] } },
        });
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

        try {
            await this.db.listing.upsert({
                where: { id: data.id },
                create: data,
                update: data,
            });
        } catch (error) {
            // Respaldo del caso de uso: dos pedidos simultáneos pasan ambos la
            // consulta "¿ya está publicado?" y el segundo choca con el índice.
            // No se busca el activo ganador: dentro de una transacción de
            // Postgres abortada cualquier consulta posterior falla, y no hay
            // forma de saber si es del mismo vendedor sin otra lectura.
            if (isActiveChannelConflict(error)) {
                throw new ChannelAlreadyListedError("Ese canal ya está publicado.", false);
            }
            throw error;
        }
    }
}
