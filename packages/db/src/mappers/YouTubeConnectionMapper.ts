import { Prisma } from "../../generated/prisma/client";
import type { YouTubeConnection as PrismaYouTubeConnection } from "../../generated/prisma/client";
import {
    YouTubeConnection,
    YouTubeConnectionStatus,
} from "@marketplace/domain/src/entities/YouTubeConnection";
import {
    MonthlyAnalytics,
    YouTubeChannelAnalytics,
} from "@marketplace/domain/src/value-objects/YouTubeChannelAnalytics";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";

const STATUSES: readonly YouTubeConnectionStatus[] = ["active", "disconnected"];

/**
 * El token de actualización llega YA cifrado desde el caso de uso y se guarda
 * tal cual: este mapper no conoce el cifrador. Lo único que serializa con
 * cuidado es la lectura de Analytics, cuyas fechas viajan como texto ISO en la
 * columna Json y hay que revivirlas.
 */
export class YouTubeConnectionMapper {
    public static toDomain(raw: PrismaYouTubeConnection): YouTubeConnection {
        if (!STATUSES.includes(raw.status as YouTubeConnectionStatus)) {
            throw new Error(`Estado de conexión de YouTube desconocido en la base: ${raw.status}`);
        }

        return YouTubeConnection.reconstitute(
            {
                sellerId: new UniqueEntityID(raw.sellerId),
                channelId: raw.channelId,
                channelTitle: raw.channelTitle,
                grantedScopes: raw.grantedScopes,
                encryptedRefreshToken: raw.refreshTokenCipher,
                status: raw.status as YouTubeConnectionStatus,
                connectedAt: raw.connectedAt,
                lastReadAt: raw.lastReadAt,
                lastSnapshot: parseSnapshot(raw.lastSnapshot),
            },
            new UniqueEntityID(raw.id),
            // La tabla no guarda `createdAt`: `connectedAt` es el alta de la conexión.
            raw.connectedAt,
        );
    }

    public static toPersistence(connection: YouTubeConnection) {
        const { id, props } = connection.toSnapshot();

        return {
            id,
            sellerId: props.sellerId.toString(),
            channelId: props.channelId,
            channelTitle: props.channelTitle,
            grantedScopes: [...props.grantedScopes],
            refreshTokenCipher: props.encryptedRefreshToken,
            status: props.status,
            connectedAt: props.connectedAt,
            lastReadAt: props.lastReadAt,
            lastSnapshot: serializeSnapshot(props.lastSnapshot),
        };
    }
}

function serializeSnapshot(reading: YouTubeChannelAnalytics): Prisma.InputJsonObject {
    return {
        channelId: reading.channelId,
        title: reading.title,
        thumbnailUrl: reading.thumbnailUrl ?? null,
        subscribers: reading.subscribers,
        views12Months: reading.views12Months,
        revenue12MonthsCents: reading.revenue12MonthsCents,
        monthly: reading.monthly.map((m) => ({ ...m })),
        topCountry: reading.topCountry ?? null,
        periodStart: reading.periodStart.toISOString(),
        periodEnd: reading.periodEnd.toISOString(),
        readAt: reading.readAt.toISOString(),
    };
}

function parseSnapshot(raw: unknown): YouTubeChannelAnalytics {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new Error("Columna `lastSnapshot` corrupta: se esperaba un objeto.");
    }
    const s: Record<string, unknown> = Object.fromEntries(Object.entries(raw));

    if (
        typeof s.channelId !== "string" ||
        typeof s.title !== "string" ||
        typeof s.subscribers !== "number" ||
        typeof s.views12Months !== "number" ||
        typeof s.revenue12MonthsCents !== "number" ||
        typeof s.periodStart !== "string" ||
        typeof s.periodEnd !== "string" ||
        typeof s.readAt !== "string" ||
        !Array.isArray(s.monthly)
    ) {
        throw new Error("Lectura de YouTube corrupta: faltan datos obligatorios.");
    }

    return YouTubeChannelAnalytics.create({
        channelId: s.channelId,
        title: s.title,
        thumbnailUrl: typeof s.thumbnailUrl === "string" ? s.thumbnailUrl : undefined,
        subscribers: s.subscribers,
        views12Months: s.views12Months,
        revenue12MonthsCents: s.revenue12MonthsCents,
        monthly: s.monthly.map(parseMonth),
        topCountry: typeof s.topCountry === "string" ? s.topCountry : undefined,
        periodStart: new Date(s.periodStart),
        periodEnd: new Date(s.periodEnd),
        readAt: new Date(s.readAt),
    });
}

function parseMonth(raw: unknown): MonthlyAnalytics {
    const m: Record<string, unknown> =
        typeof raw === "object" && raw !== null ? Object.fromEntries(Object.entries(raw)) : {};

    if (
        typeof m.month !== "string" ||
        typeof m.views !== "number" ||
        typeof m.subscribersGained !== "number" ||
        typeof m.subscribersLost !== "number" ||
        typeof m.revenueCents !== "number"
    ) {
        throw new Error("Mes de la lectura de YouTube corrupto.");
    }
    return {
        month: m.month,
        views: m.views,
        subscribersGained: m.subscribersGained,
        subscribersLost: m.subscribersLost,
        revenueCents: m.revenueCents,
    };
}
