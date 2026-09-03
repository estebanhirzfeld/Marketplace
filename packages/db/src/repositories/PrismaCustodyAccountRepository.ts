import { ICustodyAccountRepository } from "@marketplace/domain/src/ports/Repositories";
import { CustodyAccount } from "@marketplace/domain/src/entities/CustodyAccount";
import { AssetType } from "@marketplace/shared-types";
import { prisma } from "../client";
import { CustodyAccountMapper } from "../mappers/CustodyAccountMapper";

export class PrismaCustodyAccountRepository implements ICustodyAccountRepository {
    constructor(private readonly db = prisma) {}

    async findById(id: string): Promise<CustodyAccount | null> {
        const row = await this.db.custodyAccount.findUnique({ where: { id } });
        return row ? CustodyAccountMapper.toDomain(row) : null;
    }

    async findAll(): Promise<CustodyAccount[]> {
        const rows = await this.db.custodyAccount.findMany({ orderBy: { createdAt: "asc" } });
        return rows.map(CustodyAccountMapper.toDomain);
    }

    async findActive(assetType?: AssetType): Promise<CustodyAccount[]> {
        const rows = await this.db.custodyAccount.findMany({
            where: {
                isActive: true,
                ...(assetType ? { assetType } : {}),
            },
            orderBy: { createdAt: "asc" },
        });
        return rows.map(CustodyAccountMapper.toDomain);
    }

    async save(account: CustodyAccount): Promise<void> {
        const data = CustodyAccountMapper.toPersistence(account);

        await this.db.custodyAccount.upsert({
            where: { id: data.id },
            create: data,
            update: data,
        });
    }
}
