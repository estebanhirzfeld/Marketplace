import { IContractRepository } from "@marketplace/domain/src/ports/Repositories";
import { Contract } from "@marketplace/domain/src/entities/Contract";
import { ContractMapper } from "../mappers/ContractMapper";
import { prisma, PrismaLike } from "../client";

export class PrismaContractRepository implements IContractRepository {
    /**
     * El cliente se inyecta para que el Unit of Work pueda pasar el cliente
     * transaccional. Por defecto usa el singleton, que es lo correcto para
     * una lectura o una escritura suelta.
     */
    constructor(private readonly db: PrismaLike = prisma) {}

    async findById(id: string): Promise<Contract | null> {
        const raw = await this.db.contract.findUnique({ where: { id } });
        return raw ? ContractMapper.toDomain(raw) : null;
    }

    async findByOperation(operationId: string): Promise<Contract[]> {
        const rows = await this.db.contract.findMany({ where: { operationId } });
        return rows.map(ContractMapper.toDomain);
    }

    async findByListingAndSigner(listingId: string, signerId: string): Promise<Contract | null> {
        const raw = await this.db.contract.findFirst({
            where: { listingId, signerId },
        });
        return raw ? ContractMapper.toDomain(raw) : null;
    }

    async findAllByListing(listingId: string): Promise<Contract[]> {
        const rows = await this.db.contract.findMany({ where: { listingId } });
        return rows.map(ContractMapper.toDomain);
    }

    async save(contract: Contract): Promise<void> {
        const data = ContractMapper.toPersistence(contract);

        await this.db.contract.upsert({
            where: { id: data.id },
            create: data,
            update: data,
        });
    }
}
