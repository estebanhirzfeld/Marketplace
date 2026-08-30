import type { Listing as PrismaListing } from "../../generated/prisma/client";
import { Listing, ListingProps, ListingStatus } from "@marketplace/domain/src/entities/Listing";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";
import { Money } from "@marketplace/domain/src/value-objects/Money";
// El mapeo assetType -> strategy vive en el dominio: saber qué tipos de
// activo existen es regla de negocio, no detalle de persistencia.
import { createAssetStrategy } from "@marketplace/domain/src/strategies/AssetStrategyFactory";
import { AssetType } from "@marketplace/shared-types";

export class ListingMapper {
    public static toDomain(raw: PrismaListing): Listing {
        const strategy = createAssetStrategy(raw.assetType, raw.assetData as Record<string, unknown>);

        const props: ListingProps = {
            sellerId: new UniqueEntityID(raw.sellerId),
            assetStrategy: strategy,
            status: raw.status as ListingStatus,
            askingPrice: Money.fromCents(raw.askingPrice, raw.currency),
            isBlind: raw.isBlind,
            publishedAt: raw.publishedAt ?? undefined,
            rejectionReason: raw.rejectionReason ?? undefined,
        };

        return Listing.reconstitute(
            props,
            new UniqueEntityID(raw.id),
            raw.createdAt
        );
    }

    public static toPersistence(listing: Listing, assetType: AssetType, assetData: Record<string, any>) {
        const { id, createdAt, props } = listing.toSnapshot();

        return {
            id,
            sellerId: props.sellerId.toString(),
            assetType,
            assetData,
            status: props.status,
            askingPrice: props.askingPrice.getCents(),
            currency: props.askingPrice.getCurrency(),
            isBlind: props.isBlind,
            publishedAt: props.publishedAt ?? null,
            rejectionReason: props.rejectionReason ?? null,
            createdAt,
        };
    }
}
