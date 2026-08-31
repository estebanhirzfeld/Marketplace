import { IOperationRepository } from "@marketplace/domain/src/ports/Repositories";
import { Operation, OperationStatus } from "@marketplace/domain/src/entities/Operation";
import { OperationMapper } from "../mappers/OperationMapper";
import { prisma, PrismaLike } from "../client";

export class PrismaOperationRepository implements IOperationRepository {
    /**
     * El cliente se inyecta para que el Unit of Work pueda pasar el cliente
     * transaccional. Por defecto usa el singleton, que es lo correcto para
     * una lectura o una escritura suelta.
     */
    constructor(private readonly db: PrismaLike = prisma) {}

    async findById(id: string): Promise<Operation | null> {
        const raw = await this.db.operation.findUnique({ where: { id } });
        return raw ? OperationMapper.toDomain(raw) : null;
    }

    async findByListing(listingId: string): Promise<Operation[]> {
        const rows = await this.db.operation.findMany({ where: { listingId } });
        return rows.map(OperationMapper.toDomain);
    }

    async findByParty(userId: string): Promise<Operation[]> {
        const rows = await this.db.operation.findMany({
            where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
            orderBy: { createdAt: "desc" },
        });
        return rows.map(OperationMapper.toDomain);
    }

    /** Las más viejas primero: son las que llevan más tiempo esperando. */
    async findByStatuses(statuses: OperationStatus[]): Promise<Operation[]> {
        if (statuses.length === 0) return [];

        const rows = await this.db.operation.findMany({
            where: { status: { in: statuses as never[] } },
            orderBy: { createdAt: "asc" },
        });
        return rows.map(OperationMapper.toDomain);
    }

    async save(operation: Operation): Promise<void> {
        const data = OperationMapper.toPersistence(operation);

        await this.db.operation.upsert({
            where: { id: data.id },
            create: data,
            update: data,
        });
    }
}
