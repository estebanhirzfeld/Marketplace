import type { Listing as PrismaListing } from "../../generated/prisma";
import { Listing, ListingProps, ListingStatus } from "@marketplace/domain/src/entities/Listing";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";
import { Money } from "@marketplace/domain/src/value-objects/Money";
import { IAssetStrategy } from "@marketplace/domain/src/strategies/IAssetStrategy";
import { YouTubeStrategy } from "@marketplace/domain/src/strategies/YouTubeStrategy";
import { WebStrategy } from "@marketplace/domain/src/strategies/WebStrategy";
import { SocialStrategy } from "@marketplace/domain/src/strategies/SocialStrategy";
import { AssetType } from "@marketplace/shared-types";

/**
 * Reconstruye la instancia de IAssetStrategy a partir del tipo de activo
 * y los datos serializados en JSON.
 */
function hydrateStrategy(assetType: string, assetData: Record<string, any>): IAssetStrategy {
    switch (assetType) {
        case "youtube":
            return new YouTubeStrategy({
                monthlyRevenueUsd: Money.fromCents(assetData.monthlyRevenueUsdCents, assetData.currency ?? "USD"),
                subscribers: assetData.subscribers,
                growthFactor: assetData.growthFactor,
                isMonetized: assetData.isMonetized,
                audienceTopCountry: assetData.audienceTopCountry,
                hasNoFaceContent: assetData.hasNoFaceContent,
            });
        case "web":
            return new WebStrategy(
                Money.fromCents(assetData.monthlyRevenueUsdCents, assetData.currency ?? "USD"),
                assetData.domainAuthority
            );
        case "instagram":
        case "tiktok":
            return new SocialStrategy(
                assetData.followers,
                assetData.engagementRate,
                assetType === "instagram" ? AssetType.INSTAGRAM : AssetType.TIKTOK
            );
        default:
            throw new Error(`Tipo de activo desconocido: ${assetType}`);
    }
}

export class ListingMapper {
    public static toDomain(raw: PrismaListing): Listing {
        const strategy = hydrateStrategy(raw.assetType, raw.assetData as Record<string, any>);

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

    public static toPersistence(listing: Listing, assetType: string, assetData: Record<string, any>) {
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
