import { Prisma } from "../../generated/prisma/client";
import type { Listing as PrismaListing } from "../../generated/prisma/client";
import {
    PlatformAccessRecord,
    Listing,
    ListingProps,
    ListingStatus,
    OwnershipVerification,
    VerificationSource,
} from "@marketplace/domain/src/entities/Listing";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";
import { Money } from "@marketplace/domain/src/value-objects/Money";
// El mapeo assetType -> strategy vive en el dominio: saber qué tipos de
// activo existen es regla de negocio, no detalle de persistencia.
import { createAssetStrategy } from "@marketplace/domain/src/strategies/AssetStrategyFactory";
import { AssetType } from "@marketplace/shared-types";

/**
 * Lee la constancia de acceso. Las dos fechas viajan a la columna Json como
 * string ISO y hay que revivirlas: `accessSince` es de la que depende todo el
 * cálculo del plazo, así que si vuelve como texto el listing queda listo o
 * bloqueado por accidente.
 */
function parseAcceso(raw: unknown, custodyAccountId: string | null): PlatformAccessRecord | undefined {
    if (raw === null || raw === undefined) return undefined;
    if (typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Columna `platformAccess` corrupta: se esperaba un objeto.");
    }

    const a = raw as Record<string, unknown>;

    if (
        typeof a.verifiedBy !== "string" ||
        typeof a.verifiedAt !== "string" ||
        typeof a.accessSince !== "string"
    ) {
        throw new Error("Constancia de acceso corrupta: falta quién verificó o alguna fecha.");
    }

    return {
        verifiedBy: new UniqueEntityID(a.verifiedBy),
        verifiedAt: new Date(a.verifiedAt),
        accessSince: new Date(a.accessSince),
        // La cuenta de custodia vive en su propia columna, no en el Json. Si
        // hay constancia sin columna, es una fila anterior a este cambio:
        // sigue siendo válida y se presenta como "cuenta sin asignar".
        custodyAccountId: custodyAccountId ? new UniqueEntityID(custodyAccountId) : undefined,
        notes: typeof a.notes === "string" ? a.notes : undefined,
    };
}

/**
 * Devuelve el par para las dos columnas. El Json `platformAccess` NO repite el
 * `custodyAccountId`: una sola copia guardada, la columna, así no hay dos que
 * puedan divergir.
 *
 * `Prisma.DbNull` y no `undefined` cuando no hay constancia: el acceso SÍ se
 * revoca —el vendedor puede expulsar a la plataforma— y un `undefined` en un
 * update de Prisma significa "no tocar", con lo que la constancia revocada
 * sobreviviría. Una constancia revocada que conserva la FK seguiría contando
 * la cuenta como sosteniendo el activo.
 */
function serializeAcceso(a?: PlatformAccessRecord): {
    platformAccess: Prisma.InputJsonValue | typeof Prisma.DbNull;
    custodyAccountId: string | null;
} {
    if (!a) return { platformAccess: Prisma.DbNull, custodyAccountId: null };
    return {
        platformAccess: {
            verifiedBy: a.verifiedBy.toString(),
            verifiedAt: a.verifiedAt.toISOString(),
            accessSince: a.accessSince.toISOString(),
            notes: a.notes ?? null,
        },
        custodyAccountId: a.custodyAccountId ? a.custodyAccountId.toString() : null,
    };
}

const FUENTES: readonly VerificationSource[] = ["youtube", "adsense"];

/**
 * Lee la constancia de titularidad. La fuente se valida contra la lista: si la
 * columna trae una desconocida, la constancia no dice nada comprobable y es
 * preferible fallar que aceptarla.
 */
function parseOwnership(raw: unknown): OwnershipVerification | undefined {
    if (raw === null || raw === undefined) return undefined;
    if (typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Columna `ownershipCheck` corrupta: se esperaba un objeto.");
    }

    const o = raw as Record<string, unknown>;

    if (
        typeof o.verifiedBy !== "string" ||
        typeof o.verifiedAt !== "string" ||
        typeof o.assetId !== "string"
    ) {
        throw new Error("Constancia de titularidad corrupta: faltan datos obligatorios.");
    }
    if (!FUENTES.includes(o.source as VerificationSource)) {
        throw new Error(`Fuente de verificación desconocida en la base: ${String(o.source)}`);
    }

    return {
        verifiedBy: new UniqueEntityID(o.verifiedBy),
        verifiedAt: new Date(o.verifiedAt),
        assetId: o.assetId,
        source: o.source as VerificationSource,
        monthlyRevenueCents:
            typeof o.monthlyRevenueCents === "number" ? o.monthlyRevenueCents : undefined,
    };
}

function serializeOwnership(o?: OwnershipVerification) {
    if (!o) return Prisma.DbNull;
    return {
        verifiedBy: o.verifiedBy.toString(),
        verifiedAt: o.verifiedAt.toISOString(),
        assetId: o.assetId,
        source: o.source,
        monthlyRevenueCents: o.monthlyRevenueCents ?? null,
    };
}

export class ListingMapper {
    public static toDomain(raw: PrismaListing): Listing {
        const strategy = createAssetStrategy(raw.assetType, raw.assetData as Record<string, unknown>);

        const props: ListingProps = {
            sellerId: new UniqueEntityID(raw.sellerId),
            assetStrategy: strategy,
            status: raw.status as ListingStatus,
            askingPrice: Money.fromCents(raw.askingPrice, raw.currency),
            publishedAt: raw.publishedAt ?? undefined,
            rejectionReason: raw.rejectionReason ?? undefined,
            platformAccess: parseAcceso(raw.platformAccess, raw.custodyAccountId),
            ownershipVerification: parseOwnership(raw.ownershipCheck),
        };

        return Listing.reconstitute(
            props,
            new UniqueEntityID(raw.id),
            raw.createdAt
        );
    }

    public static toPersistence(listing: Listing, assetType: AssetType, assetData: Record<string, any>) {
        const { id, createdAt, props } = listing.toSnapshot();
        const acceso = serializeAcceso(props.platformAccess);

        return {
            id,
            sellerId: props.sellerId.toString(),
            assetType,
            assetData,
            status: props.status,
            askingPrice: props.askingPrice.getCents(),
            currency: props.askingPrice.getCurrency(),
            publishedAt: props.publishedAt ?? null,
            rejectionReason: props.rejectionReason ?? null,
            platformAccess: acceso.platformAccess,
            custodyAccountId: acceso.custodyAccountId,
            ownershipCheck: serializeOwnership(props.ownershipVerification),
            createdAt,
        };
    }
}
