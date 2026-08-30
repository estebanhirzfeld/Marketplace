import type { Operation as PrismaOperation } from "../../generated/prisma/client";
import { Operation, OperationProps, OperationStatus, Negotiation, NegotiatingParty } from "@marketplace/domain/src/entities/Operation";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";
import { Money } from "@marketplace/domain/src/value-objects/Money";

const NEGOTIATING_PARTIES: readonly NegotiatingParty[] = ["buyer", "seller"];

function isNegotiatingParty(value: unknown): value is NegotiatingParty {
    return typeof value === "string" && (NEGOTIATING_PARTIES as readonly string[]).includes(value);
}

/**
 * Lee la columna Json `negotiations`. Los Date viajan como string ISO, así que
 * hay que revivirlos — y validar el turno, porque de él depende quién puede
 * responder la oferta.
 */
function parseNegotiations(raw: PrismaOperation["negotiations"]): Negotiation[] {
    if (!Array.isArray(raw)) {
        throw new Error("Columna `negotiations` corrupta: se esperaba un array.");
    }

    return raw.map((entry): Negotiation => {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
            throw new Error("Negociación corrupta: se esperaba un objeto.");
        }

        const { amount, currency, proposedBy, proposedAt } = entry as Record<string, unknown>;

        if (typeof amount !== "number" || typeof currency !== "string") {
            throw new Error("Negociación corrupta: monto o moneda inválidos.");
        }
        if (!isNegotiatingParty(proposedBy)) {
            throw new Error(`Parte negociadora desconocida en la base: ${String(proposedBy)}`);
        }
        if (typeof proposedAt !== "string") {
            throw new Error("Negociación corrupta: falta la fecha de la propuesta.");
        }

        return { amount, currency, proposedBy, proposedAt: new Date(proposedAt) };
    });
}

/** Forma JSON-safe: sin Date, que Prisma no acepta como InputJson. */
function serializeNegotiations(negotiations: readonly Negotiation[]) {
    return negotiations.map((n) => ({
        amount: n.amount,
        currency: n.currency,
        proposedBy: n.proposedBy,
        proposedAt: n.proposedAt.toISOString(),
    }));
}

export class OperationMapper {
    public static toDomain(raw: PrismaOperation): Operation {
        const negotiations = parseNegotiations(raw.negotiations);

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
            negotiations: serializeNegotiations(props.negotiations),
            completedAt: props.completedAt ?? null,
            createdAt,
        };
    }
}
