import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { UserRole } from "@marketplace/shared-types";
import { User } from "@marketplace/domain/src/entities/User";
import { Listing } from "@marketplace/domain/src/entities/Listing";
import { Operation } from "@marketplace/domain/src/entities/Operation";
import { Notification } from "@marketplace/domain/src/entities/Notification";
import { Email } from "@marketplace/domain/src/value-objects/Email";
import { Money } from "@marketplace/domain/src/value-objects/Money";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";
import { YouTubeStrategy } from "@marketplace/domain/src/strategies/YouTubeStrategy";
import { PrismaUserRepository } from "../src/repositories/PrismaUserRepository";
import { PrismaListingRepository } from "../src/repositories/PrismaListingRepository";
import { PrismaOperationRepository } from "../src/repositories/PrismaOperationRepository";
import { PrismaNotificationRepository } from "../src/repositories/PrismaNotificationRepository";
import { prisma } from "../src/client";

/**
 * Regresión: las columnas de dinero eran `Int` de 32 bits (tope 2.147.483.647
 * centavos), así que un precio de $45.555.554,97 ARS reventaba con un 500.
 * Ahora son `BigInt` en la base y `number` en el dominio.
 */

const userRepo = new PrismaUserRepository();
const listingRepo = new PrismaListingRepository();
const operationRepo = new PrismaOperationRepository();
const notificationRepo = new PrismaNotificationRepository();

// Los valores del reporte original: no entran en un Int de 32 bits.
const ASKING_CENTS = 4_555_555_497;
const MAX_PRICE_FILTER = 12_312_312_300;

async function createUser(email: string, role: UserRole): Promise<User> {
    const user = User.create({
        email: Email.create(email),
        fullName: "Usuario de Prueba",
        role,
        country: "AR",
        passwordHash: "hash-de-prueba",
    });
    await userRepo.save(user);
    return user;
}

function createListing(sellerId: UniqueEntityID, cents: number, currency = "ARS"): Listing {
    const listing = Listing.create({
        sellerId,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(50000, "USD"),
            subscribers: 10000,
            growthFactor: 1.2,
            isMonetized: true,
            hasNoFaceContent: false,
            audienceTopCountry: "US",
        }),
        askingPrice: Money.fromCents(cents, currency),
    });
    return listing;
}

async function clean(): Promise<void> {
    await prisma.notification.deleteMany();
    await prisma.operation.deleteMany();
    await prisma.listing.deleteMany();
    await prisma.user.deleteMany();
}

beforeEach(clean);

afterAll(async () => {
    await clean();
    await prisma.$disconnect();
});

describe("dinero que no entra en 32 bits", () => {
    it("persiste y relee un Listing con askingPrice de 4555555497 centavos", async () => {
        const seller = await createUser("seller-big@test.com", UserRole.SELLER);
        const listing = createListing(seller.id, ASKING_CENTS);

        await listingRepo.save(listing);
        const retrieved = await listingRepo.findById(listing.id.toString());

        expect(retrieved!.askingPrice.getCents()).toBe(ASKING_CENTS);
        expect(retrieved!.askingPrice.getCurrency()).toBe("ARS");
    });

    it("persiste y relee una Operation con oferta, precio final y comisiones grandes", async () => {
        const buyer = await createUser("buyer-big@test.com", UserRole.BUYER);
        const seller = await createUser("seller-op-big@test.com", UserRole.SELLER);
        const listing = createListing(seller.id, ASKING_CENTS);
        await listingRepo.save(listing);

        const operation = Operation.create({
            listingId: listing.id,
            buyerId: buyer.id,
            sellerId: seller.id,
            offerPrice: Money.fromCents(ASKING_CENTS, "ARS"),
        });
        await operationRepo.save(operation);
        operation.acceptCurrentOffer("seller");
        await operationRepo.save(operation);

        const retrieved = await operationRepo.findById(operation.id.toString());
        const original = operation.toSnapshot().props;

        expect(retrieved!.currentOfferPrice.getCents()).toBe(ASKING_CENTS);
        expect(retrieved!.finalPrice?.getCents()).toBe(ASKING_CENTS);
        // 5% de 4555555497 = 227777774,85 -> 227777775
        expect(original.buyerCommission?.getCents()).toBe(227_777_775);
        expect(retrieved!.toSnapshot().props.buyerCommission?.getCents()).toBe(227_777_775);
        expect(retrieved!.toSnapshot().props.sellerCommission?.getCents()).toBe(227_777_775);
        expect(retrieved!.toSnapshot().props.buyerPays?.getCents()).toBe(ASKING_CENTS + 227_777_775);
        expect(retrieved!.toSnapshot().props.sellerReceives?.getCents()).toBe(ASKING_CENTS - 227_777_775);
        expect(retrieved!.toSnapshot().props.platformEarns?.getCents()).toBe(2 * 227_777_775);
    });

    it("persiste y relee un aviso con amountCents grande", async () => {
        const user = await createUser("aviso-big@test.com", UserRole.BUYER);
        const aviso = Notification.create({
            userId: user.id,
            type: "oferta_recibida",
            operationId: new UniqueEntityID(),
            listingId: new UniqueEntityID(),
            amountCents: ASKING_CENTS,
            currency: "ARS",
        });
        await notificationRepo.save(aviso);

        const retrieved = await notificationRepo.findById(aviso.id.toString());

        expect(retrieved!.toSnapshot().props.amountCents).toBe(ASKING_CENTS);
    });

    it("el filtro maxPrice=12312312300 no explota y respeta el rango", async () => {
        const seller = await createUser("seller-filter@test.com", UserRole.SELLER);
        const cheap = createListing(seller.id, ASKING_CENTS);
        const expensive = createListing(seller.id, MAX_PRICE_FILTER + 1);
        for (const listing of [cheap, expensive]) {
            listing.submitForReview();
            listing.approve();
            await listingRepo.save(listing);
        }

        const withinMax = await listingRepo.findPublished({ maxPrice: MAX_PRICE_FILTER });
        expect(withinMax.map((l) => l.id.toString())).toEqual([cheap.id.toString()]);

        const aboveMin = await listingRepo.findPublished({ minPrice: ASKING_CENTS + 1 });
        expect(aboveMin.map((l) => l.id.toString())).toEqual([expensive.id.toString()]);
    });
});
