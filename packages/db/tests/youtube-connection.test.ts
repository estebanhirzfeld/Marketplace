import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { AssetType, UserRole } from "@marketplace/shared-types";
import { User } from "@marketplace/domain/src/entities/User";
import { Email } from "@marketplace/domain/src/value-objects/Email";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";
import { Money } from "@marketplace/domain/src/value-objects/Money";
import { Listing } from "@marketplace/domain/src/entities/Listing";
import { YouTubeConnection } from "@marketplace/domain/src/entities/YouTubeConnection";
import { YouTubeChannelAnalytics } from "@marketplace/domain/src/value-objects/YouTubeChannelAnalytics";
import { REQUIRED_YOUTUBE_SCOPES } from "@marketplace/domain/src/value-objects/YouTubeScopes";
import { createAssetStrategy } from "@marketplace/domain/src/strategies/AssetStrategyFactory";
import { ChannelAlreadyListedError } from "@marketplace/domain/src/errors/DomainError";
import { PrismaUserRepository } from "../src/repositories/PrismaUserRepository";
import { PrismaListingRepository } from "../src/repositories/PrismaListingRepository";
import { PrismaYouTubeConnectionRepository } from "../src/repositories/PrismaYouTubeConnectionRepository";
import { PrismaYouTubeChannelListingFinder } from "../src/repositories/PrismaYouTubeChannelListingFinder";
import { prisma } from "../src/client";

const userRepo = new PrismaUserRepository();
const listingRepo = new PrismaListingRepository();
const connectionRepo = new PrismaYouTubeConnectionRepository();
const finder = new PrismaYouTubeChannelListingFinder();

const READ_AT = new Date("2026-10-09T12:00:00.000Z");
const CHANNEL_ID = "UCq-Fj5jknLsUf-MWSy4_brA";

async function createSeller(email: string): Promise<User> {
    const user = User.create({
        email: Email.create(email),
        fullName: "Vendedor de prueba",
        role: UserRole.SELLER,
        country: "AR",
        passwordHash: "hash-de-prueba",
    });
    await userRepo.save(user);
    return user;
}

function buildReading(channelId = CHANNEL_ID, overrides: { topCountry?: string | undefined } = {}) {
    return YouTubeChannelAnalytics.create({
        channelId,
        title: "Canal de prueba",
        thumbnailUrl: "https://yt3.example/foto.jpg",
        subscribers: 12_000,
        views12Months: 480_000,
        revenue12MonthsCents: 360_000,
        monthly: [
            { month: "2026-08", views: 45_000, subscribersGained: 350, subscribersLost: 25, revenueCents: 60_000 },
            { month: "2026-09", views: 50_000, subscribersGained: 500, subscribersLost: 40, revenueCents: 90_000 },
        ],
        topCountry: "topCountry" in overrides ? overrides.topCountry : "US",
        periodStart: new Date("2025-10-01T00:00:00.000Z"),
        periodEnd: new Date("2026-10-01T00:00:00.000Z"),
        readAt: READ_AT,
    });
}

function buildConnection(sellerId: UniqueEntityID, channelId = CHANNEL_ID) {
    return YouTubeConnection.create({
        sellerId,
        channelId,
        channelTitle: "Canal de prueba",
        grantedScopes: [...REQUIRED_YOUTUBE_SCOPES],
        encryptedRefreshToken: "v1:token-ya-cifrado",
        connectedAt: READ_AT,
        lastSnapshot: buildReading(channelId),
    });
}

/** Un activo creado desde la conexión: URL `/channel/<id>` y marca de lectura de Google. */
function buildVerifiedListing(sellerId: UniqueEntityID, channelId = CHANNEL_ID) {
    const listing = Listing.create({
        sellerId,
        assetStrategy: createAssetStrategy(AssetType.YOUTUBE, {
            monthlyRevenueUsdCents: 75_000,
            subscribers: 12_000,
            isMonetized: true,
            growthFactor: 1,
            channelUrl: `https://www.youtube.com/channel/${channelId}`,
            verifiedFromYouTubeAt: READ_AT.toISOString(),
        }),
        askingPrice: Money.fromCents(1_500_000, "USD"),
    });
    listing.registerOwnershipVerification({ verifiedBy: sellerId, assetId: channelId, source: "youtube" });
    return listing;
}

/** Mismo orden que el resto de las suites: respeta las claves foráneas. */
async function cleanDatabase() {
    await prisma.report.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.contract.deleteMany();
    await prisma.operation.deleteMany();
    await prisma.listing.deleteMany();
    await prisma.custodyAccount.deleteMany();
    await prisma.youTubeConnection.deleteMany();
    await prisma.user.deleteMany();
}

beforeEach(async () => {
    await cleanDatabase();
});

afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
});

describe("PrismaYouTubeConnectionRepository", () => {
    it("ida y vuelta: conserva permisos, token cifrado y la lectura completa", async () => {
        const seller = await createSeller("yt-rt@test.com");
        const connection = buildConnection(seller.id);

        await connectionRepo.save(connection);
        const read = await connectionRepo.findBySellerAndChannel(seller.id.toString(), CHANNEL_ID);

        expect(read).not.toBeNull();
        expect(read!.id.equals(connection.id)).toBe(true);
        expect(read!.sellerId.equals(seller.id)).toBe(true);
        expect(read!.channelTitle).toBe("Canal de prueba");
        expect(read!.grantedScopes).toEqual([...REQUIRED_YOUTUBE_SCOPES]);
        expect(read!.encryptedRefreshToken).toBe("v1:token-ya-cifrado");
        expect(read!.status).toBe("active");
        expect(read!.connectedAt).toEqual(READ_AT);
        expect(read!.lastReadAt).toEqual(READ_AT);

        const snapshot = read!.lastSnapshot;
        expect(snapshot.channelId).toBe(CHANNEL_ID);
        expect(snapshot.subscribers).toBe(12_000);
        expect(snapshot.topCountry).toBe("US");
        expect(snapshot.periodStart).toEqual(new Date("2025-10-01T00:00:00.000Z"));
        expect(snapshot.readAt).toEqual(READ_AT);
        expect(snapshot.monthly).toEqual(buildReading().monthly);
        expect(snapshot.monthlyRevenueCents()).toBe(connection.lastSnapshot.monthlyRevenueCents());
        expect(snapshot.isMonetized()).toBe(true);
    });

    it("guarda una lectura sin país ni foto", async () => {
        const seller = await createSeller("yt-nocountry@test.com");
        const connection = YouTubeConnection.create({
            ...{
                sellerId: seller.id,
                channelId: CHANNEL_ID,
                channelTitle: "Canal de prueba",
                grantedScopes: [...REQUIRED_YOUTUBE_SCOPES],
                encryptedRefreshToken: "v1:x",
                connectedAt: READ_AT,
            },
            lastSnapshot: buildReading(CHANNEL_ID, { topCountry: undefined }),
        });

        await connectionRepo.save(connection);
        const read = await connectionRepo.findBySellerAndChannel(seller.id.toString(), CHANNEL_ID);

        expect(read!.lastSnapshot.topCountry).toBeUndefined();
    });

    it("devuelve null para un canal que ese vendedor no conectó", async () => {
        const seller = await createSeller("yt-null@test.com");
        const other = await createSeller("yt-null2@test.com");
        await connectionRepo.save(buildConnection(other.id));

        expect(await connectionRepo.findBySellerAndChannel(seller.id.toString(), CHANNEL_ID)).toBeNull();
    });

    it("guardar de nuevo la misma conexión actualiza la fila en vez de duplicarla", async () => {
        const seller = await createSeller("yt-upsert@test.com");
        const connection = buildConnection(seller.id);
        await connectionRepo.save(connection);

        connection.disconnect();
        await connectionRepo.save(connection);

        expect(await prisma.youTubeConnection.count()).toBe(1);
        const read = await connectionRepo.findBySellerAndChannel(seller.id.toString(), CHANNEL_ID);
        expect(read!.status).toBe("disconnected");
    });

    it("reconectar con una entidad nueva del mismo par pisa la fila anterior", async () => {
        const seller = await createSeller("yt-reconnect@test.com");
        await connectionRepo.save(buildConnection(seller.id));
        const second = buildConnection(seller.id);

        await connectionRepo.save(second);

        expect(await prisma.youTubeConnection.count()).toBe(1);
    });

    it("lista solo las conexiones del vendedor", async () => {
        const seller = await createSeller("yt-list@test.com");
        const other = await createSeller("yt-list2@test.com");
        await connectionRepo.save(buildConnection(seller.id, "UC-uno"));
        await connectionRepo.save(buildConnection(seller.id, "UC-dos"));
        await connectionRepo.save(buildConnection(other.id, "UC-tres"));

        const mine = await connectionRepo.findBySeller(seller.id.toString());

        expect(mine.map((c) => c.channelId).sort()).toEqual(["UC-dos", "UC-uno"]);
    });

    it("la base permite que dos vendedores conecten el mismo canal", async () => {
        const a = await createSeller("yt-a@test.com");
        const b = await createSeller("yt-b@test.com");

        await connectionRepo.save(buildConnection(a.id));
        await connectionRepo.save(buildConnection(b.id));

        expect(await prisma.youTubeConnection.count()).toBe(2);
    });

    it("guarda el token tal como llega: la base nunca ve el token en claro", async () => {
        const seller = await createSeller("yt-cipher@test.com");
        await connectionRepo.save(buildConnection(seller.id));

        const row = await prisma.youTubeConnection.findFirstOrThrow();

        expect(row.refreshTokenCipher).toBe("v1:token-ya-cifrado");
    });
});

describe("PrismaYouTubeChannelListingFinder", () => {
    it("encuentra los activos del canal, de cualquier vendedor y estado", async () => {
        const a = await createSeller("find-a@test.com");
        const b = await createSeller("find-b@test.com");
        const rejected = buildVerifiedListing(a.id);
        rejected.submitForReview();
        rejected.reject("No cumple");
        await listingRepo.save(rejected);
        await listingRepo.save(buildVerifiedListing(b.id));
        await listingRepo.save(buildVerifiedListing(b.id, "UC-otro-canal"));

        const found = await finder.findByChannelId(CHANNEL_ID);

        expect(found).toHaveLength(2);
        expect(found.map((l) => l.status).sort()).toEqual(["draft", "rejected"]);
    });

    it("no confunde un canal con otro cuyo id lo contiene", async () => {
        const seller = await createSeller("find-prefix@test.com");
        await listingRepo.save(buildVerifiedListing(seller.id, `${CHANNEL_ID}extra`));

        expect(await finder.findByChannelId(CHANNEL_ID)).toEqual([]);
    });

    it("rehidrata la marca de lectura de Google del activo", async () => {
        const seller = await createSeller("find-mark@test.com");
        await listingRepo.save(buildVerifiedListing(seller.id));

        const [found] = await finder.findByChannelId(CHANNEL_ID);

        expect(found.toSnapshot().props.assetStrategy.toJSON().assetData.verifiedFromYouTubeAt).toBe(
            READ_AT.toISOString(),
        );
    });
});

describe("PrismaListingRepository — un canal vigente por activo", () => {
    it("rechaza un segundo activo vigente sobre el mismo canal", async () => {
        const a = await createSeller("dup-a@test.com");
        const b = await createSeller("dup-b@test.com");
        await listingRepo.save(buildVerifiedListing(a.id));

        await expect(listingRepo.save(buildVerifiedListing(b.id))).rejects.toBeInstanceOf(ChannelAlreadyListedError);
        expect(await prisma.listing.count()).toBe(1);
    });

    it("de dos pedidos simultáneos solo uno gana", async () => {
        const a = await createSeller("race-a@test.com");
        const b = await createSeller("race-b@test.com");

        const results = await Promise.allSettled([
            listingRepo.save(buildVerifiedListing(a.id)),
            listingRepo.save(buildVerifiedListing(b.id)),
        ]);

        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
        expect(rejected).toHaveLength(1);
        expect(rejected[0].reason).toBeInstanceOf(ChannelAlreadyListedError);
        expect(await prisma.listing.count()).toBe(1);
    });

    it("guardar de nuevo el mismo activo no choca consigo mismo", async () => {
        const seller = await createSeller("dup-self@test.com");
        const listing = buildVerifiedListing(seller.id);
        await listingRepo.save(listing);

        listing.submitForReview();

        await expect(listingRepo.save(listing)).resolves.toBeUndefined();
    });

    it("un activo rechazado libera el canal", async () => {
        const a = await createSeller("free-a@test.com");
        const b = await createSeller("free-b@test.com");
        const first = buildVerifiedListing(a.id);
        await listingRepo.save(first);
        first.submitForReview();
        first.reject("No cumple");
        await listingRepo.save(first);

        await expect(listingRepo.save(buildVerifiedListing(b.id))).resolves.toBeUndefined();
    });

    it("un activo cargado a mano (sin la marca de Google) no entra en la garantía", async () => {
        const a = await createSeller("manual-a@test.com");
        const b = await createSeller("manual-b@test.com");
        const manual = (sellerId: UniqueEntityID) =>
            Listing.create({
                sellerId,
                assetStrategy: createAssetStrategy(AssetType.YOUTUBE, {
                    monthlyRevenueUsdCents: 0,
                    subscribers: 10,
                    isMonetized: false,
                    channelUrl: `https://www.youtube.com/channel/${CHANNEL_ID}`,
                }),
                askingPrice: Money.fromCents(100_000, "USD"),
            });

        await listingRepo.save(manual(a.id));

        await expect(listingRepo.save(manual(b.id))).resolves.toBeUndefined();
    });
});
