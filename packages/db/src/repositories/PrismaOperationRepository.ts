import { IOperationRepository } from "@marketplace/domain/src/ports/Repositories";
import { Operation } from "@marketplace/domain/src/entities/Operation";
import { OperationMapper } from "../mappers/OperationMapper";
import { prisma } from "../client";

export class PrismaOperationRepository implements IOperationRepository {
    async findById(id: string): Promise<Operation | null> {
        const raw = await prisma.operation.findUnique({ where: { id } });
        return raw ? OperationMapper.toDomain(raw) : null;
    }

    async findByListing(listingId: string): Promise<Operation[]> {
        const rows = await prisma.operation.findMany({ where: { listingId } });
        return rows.map(OperationMapper.toDomain);
    }

    async save(operation: Operation): Promise<void> {
        const data = OperationMapper.toPersistence(operation);

        await prisma.operation.upsert({
            where: { id: data.id },
            create: data,
            update: data,
        });
    }
}
