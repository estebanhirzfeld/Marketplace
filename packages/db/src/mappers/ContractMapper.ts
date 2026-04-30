import type { Contract as PrismaContract } from "../../generated/prisma";
import { Contract, ContractProps, ContractType, Signature } from "@marketplace/domain/src/entities/Contract";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";

export class ContractMapper {
    public static toDomain(raw: PrismaContract): Contract {
        const props: ContractProps = {
            type: raw.type as ContractType,
            listingId: new UniqueEntityID(raw.listingId),
            operationId: raw.operationId ? new UniqueEntityID(raw.operationId) : undefined,
            signerId: raw.signerId ? new UniqueEntityID(raw.signerId) : undefined,
            signatures: raw.signatures as Signature[],
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
            signatures: props.signatures as any,
            externalSignatureId: props.externalSignatureId ?? null,
            fileUrl: props.fileUrl ?? null,
            createdAt,
        };
    }
}
