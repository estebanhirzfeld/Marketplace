import type { CustodyAccount as PrismaCustodyAccount } from "../../generated/prisma/client";
import {
    CustodyAccount,
    CustodyAccountProps,
} from "@marketplace/domain/src/entities/CustodyAccount";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";
import { AssetType } from "@marketplace/shared-types";

const TIPOS: readonly AssetType[] = Object.values(AssetType);

export class CustodyAccountMapper {
    public static toDomain(raw: PrismaCustodyAccount): CustodyAccount {
        if (!TIPOS.includes(raw.assetType as AssetType)) {
            throw new Error(`Tipo de activo desconocido en la cuenta de custodia: ${raw.assetType}`);
        }

        const props: CustodyAccountProps = {
            label: raw.label,
            identifier: raw.identifier,
            assetType: raw.assetType as AssetType,
            isActive: raw.isActive,
            notes: raw.notes ?? undefined,
        };

        return CustodyAccount.reconstitute(props, new UniqueEntityID(raw.id), raw.createdAt);
    }

    public static toPersistence(account: CustodyAccount) {
        const { id, createdAt, props } = account.toSnapshot();

        return {
            id,
            label: props.label,
            identifier: props.identifier,
            assetType: props.assetType,
            isActive: props.isActive,
            notes: props.notes ?? null,
            createdAt,
        };
    }
}
