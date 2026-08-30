import type { Contract as PrismaContract } from "../../generated/prisma/client";
import { Contract, ContractProps, ContractType, PartyRole, Signature } from "@marketplace/domain/src/entities/Contract";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";

const PARTY_ROLES: readonly PartyRole[] = ["buyer", "seller", "platform"];

function isPartyRole(value: unknown): value is PartyRole {
    return typeof value === "string" && (PARTY_ROLES as readonly string[]).includes(value);
}

/**
 * Lee la columna Json `signatures`.
 *
 * No se puede usar `as Signature[]`: Prisma serializa los Date a string ISO,
 * así que un cast declararía `signedAt: Date` sobre lo que en realidad es un
 * string, y el bug recién aparecería al llamar un método de Date en runtime.
 */
function parseSignatures(raw: PrismaContract["signatures"]): Signature[] {
    if (!Array.isArray(raw)) {
        throw new Error("Columna `signatures` corrupta: se esperaba un array.");
    }

    return raw.map((entry): Signature => {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
            throw new Error("Firma corrupta: se esperaba un objeto.");
        }

        const { role, signed, signedAt, signatureIp } = entry as Record<string, unknown>;

        if (!isPartyRole(role)) {
            throw new Error(`Rol de firma desconocido en la base: ${String(role)}`);
        }

        return {
            role,
            signed: signed === true,
            signedAt: typeof signedAt === "string" ? new Date(signedAt) : undefined,
            signatureIp: typeof signatureIp === "string" ? signatureIp : undefined,
        };
    });
}

/** Forma JSON-safe de una firma: sin Date, que Prisma no acepta como InputJson. */
function serializeSignatures(signatures: readonly Signature[]) {
    return signatures.map((s) => ({
        role: s.role,
        signed: s.signed,
        signedAt: s.signedAt?.toISOString() ?? null,
        signatureIp: s.signatureIp ?? null,
    }));
}

export class ContractMapper {
    public static toDomain(raw: PrismaContract): Contract {
        const props: ContractProps = {
            type: raw.type as ContractType,
            listingId: new UniqueEntityID(raw.listingId),
            operationId: raw.operationId ? new UniqueEntityID(raw.operationId) : undefined,
            signerId: raw.signerId ? new UniqueEntityID(raw.signerId) : undefined,
            signatures: parseSignatures(raw.signatures),
            externalSignatureId: raw.externalSignatureId ?? undefined,
            fileUrl: raw.fileUrl ?? undefined,
        };

        return Contract.reconstitute(
            props,
            new UniqueEntityID(raw.id),
            raw.createdAt
        );
    }

    public static toPersistence(contract: Contract) {
        const { id, createdAt, props } = contract.toSnapshot();

        return {
            id,
            type: props.type,
            listingId: props.listingId.toString(),
            operationId: props.operationId?.toString() ?? null,
            signerId: props.signerId?.toString() ?? null,
            signatures: serializeSignatures(props.signatures),
            externalSignatureId: props.externalSignatureId ?? null,
            fileUrl: props.fileUrl ?? null,
            createdAt,
        };
    }
}
