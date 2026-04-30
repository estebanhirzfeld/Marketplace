import { IContractRepository } from "@marketplace/domain/src/ports/Repositories";
import { Contract } from "@marketplace/domain/src/entities/Contract";
import { ContractMapper } from "../mappers/ContractMapper";
import { prisma } from "../client";

export class PrismaContractRepository implements IContractRepository {
    async findById(id: string): Promise<Contract | null> {
        const raw = await prisma.contract.findUnique({ where: { id } });
        return raw ? ContractMapper.toDomain(raw) : null;
    }

    async findByOperation(operationId: string): Promise<Contract[]> {
        const rows = await prisma.contract.findMany({ where: { operationId } });
        return rows.map(ContractMapper.toDomain);
    }

    async findByListingAndSigner(listingId: string, signerId: string): Promise<Contract | null> {
        const raw = await prisma.contract.findFirst({
            where: { listingId, signerId },
        });
        return raw ? ContractMapper.toDomain(raw) : null;
    }

    async findAllByListing(listingId: string): Promise<Contract[]> {
        const rows = await prisma.contract.findMany({ where: { listingId } });
        return rows.map(ContractMapper.toDomain);
    }

    async save(contract: Contract): Promise<void> {
        const data = ContractMapper.toPersistence(contract);

        await prisma.contract.upsert({
            where: { id: data.id },
            create: data,
            update: data,
        });
    }
}
