import { ISellerBankAccountRepository } from "@marketplace/domain/src/ports/Repositories";
import { SellerBankAccount } from "@marketplace/domain/src/entities/SellerBankAccount";
import { BankCurrency } from "@marketplace/domain/src/value-objects/BankDestination";
import { prisma } from "../client";
import { SellerBankAccountMapper } from "../mappers/SellerBankAccountMapper";

export class PrismaSellerBankAccountRepository implements ISellerBankAccountRepository {
    async findByUser(userId: string): Promise<SellerBankAccount[]> {
        const rows = await prisma.sellerBankAccount.findMany({ where: { userId }, orderBy: { currency: "asc" } });
        return rows.map(SellerBankAccountMapper.toDomain);
    }

    async findByUserAndCurrency(userId: string, currency: BankCurrency): Promise<SellerBankAccount | null> {
        const row = await prisma.sellerBankAccount.findUnique({ where: { userId_currency: { userId, currency } } });
        return row ? SellerBankAccountMapper.toDomain(row) : null;
    }

    async save(account: SellerBankAccount): Promise<void> {
        const data = SellerBankAccountMapper.toPersistence(account);
        await prisma.sellerBankAccount.upsert({ where: { id: data.id }, create: data, update: data });
    }
}
