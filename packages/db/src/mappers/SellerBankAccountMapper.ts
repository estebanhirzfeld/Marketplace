import type { SellerBankAccount as PrismaSellerBankAccount } from "../../generated/prisma/client";
import { SellerBankAccount } from "@marketplace/domain/src/entities/SellerBankAccount";
import { BankDestination } from "@marketplace/domain/src/value-objects/BankDestination";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";

export class SellerBankAccountMapper {
    public static toDomain(raw: PrismaSellerBankAccount): SellerBankAccount {
        return SellerBankAccount.reconstitute(
            {
                userId: new UniqueEntityID(raw.userId),
                destination: BankDestination.create({
                    cbu: raw.cbu ?? undefined,
                    alias: raw.alias ?? undefined,
                    holder: raw.holder,
                    currency: raw.currency,
                }),
                declaredAt: raw.declaredAt,
            },
            new UniqueEntityID(raw.id),
            raw.createdAt,
        );
    }

    public static toPersistence(account: SellerBankAccount) {
        const { id, props } = account.toSnapshot();
        return {
            id,
            userId: props.userId.toString(),
            currency: props.destination.currency,
            cbu: props.destination.cbu ?? null,
            alias: props.destination.alias ?? null,
            holder: props.destination.holder,
            declaredAt: props.declaredAt,
        };
    }
}
