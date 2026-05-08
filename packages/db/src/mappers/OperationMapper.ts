import type { Operation as PrismaOperation } from "../../generated/prisma";
import { Operation, OperationProps, OperationStatus, Negotiation } from "@marketplace/domain/src/entities/Operation";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";
import { Money } from "@marketplace/domain/src/value-objects/Money";

export class OperationMapper {
    public static toDomain(raw: PrismaOperation): Operation {
        const negotiations = (raw.negotiations as any[]).map((n): Negotiation => ({
            amount: n.amount,
            currency: n.currency,
            proposedBy: n.proposedBy,
            proposedAt: new Date(n.proposedAt),
        }));

        const props: OperationProps = {
            listingId: new UniqueEntityID(raw.listingId),
            buyerId: new UniqueEntityID(raw.buyerId),
            sellerId: new UniqueEntityID(raw.sellerId),
            status: raw.status as OperationStatus,
            offerPrice: Money.fromCents(raw.offerPrice, raw.currency),
            negotiations,
            finalPrice: raw.finalPrice ? Money.fromCents(raw.finalPrice, raw.currency) : undefined,
            buyerCommission: raw.buyerCommission ? Money.fromCents(raw.buyerCommission, raw.currency) : undefined,
            sellerCommission: raw.sellerCommission ? Money.fromCents(raw.sellerCommission, raw.currency) : undefined,
            buyerPays: raw.buyerPays ? Money.fromCents(raw.buyerPays, raw.currency) : undefined,
            sellerReceives: raw.sellerReceives ? Money.fromCents(raw.sellerReceives, raw.currency) : undefined,
            platformEarns: raw.platformEarns ? Money.fromCents(raw.platformEarns, raw.currency) : undefined,
            completedAt: raw.completedAt ?? undefined,
        };

        return Operation.reconstitute(
            props,
            new UniqueEntityID(raw.id),
            raw.createdAt
        );
    }

    public static toPersistence(operation: Operation) {
        const { id, createdAt, props } = operation.toSnapshot();

        return {
            id,
            listingId: props.listingId.toString(),
            buyerId: props.buyerId.toString(),
            sellerId: props.sellerId.toString(),
            status: props.status,
            offerPrice: props.offerPrice.getCents(),
            finalPrice: props.finalPrice?.getCents() ?? null,
            buyerCommission: props.buyerCommission?.getCents() ?? null,
            sellerCommission: props.sellerCommission?.getCents() ?? null,
            buyerPays: props.buyerPays?.getCents() ?? null,
            sellerReceives: props.sellerReceives?.getCents() ?? null,
            platformEarns: props.platformEarns?.getCents() ?? null,
            currency: props.offerPrice.getCurrency(),
            negotiations: props.negotiations as any,
            completedAt: props.completedAt ?? null,
            createdAt,
        };
    }
}
