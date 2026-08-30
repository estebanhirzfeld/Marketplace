import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { UserRole } from "@marketplace/shared-types";
import { User } from "@marketplace/domain/src/entities/User";
import { Email } from "@marketplace/domain/src/value-objects/Email";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";
import { PrismaUserRepository } from "../src/repositories/PrismaUserRepository";
import { Listing } from "@marketplace/domain/src/entities/Listing";
import { Money } from "@marketplace/domain/src/value-objects/Money";
import { YouTubeStrategy } from "@marketplace/domain/src/strategies/YouTubeStrategy";
import { PrismaListingRepository } from "../src/repositories/PrismaListingRepository";
import { Contract } from "@marketplace/domain/src/entities/Contract";
import { PrismaContractRepository } from "../src/repositories/PrismaContractRepository";
import { Operation } from "@marketplace/domain/src/entities/Operation";
import { PrismaOperationRepository } from "../src/repositories/PrismaOperationRepository";
import { prisma } from "../src/client";

const userRepo = new PrismaUserRepository();
const listingRepo = new PrismaListingRepository();
const contractRepo = new PrismaContractRepository();
const operationRepo = new PrismaOperationRepository();

// ── Helpers ──────────────────────────────────────────────
// Cada test debe crear su propia data. Estos helpers evitan
// duplicar la lógica de setup sin acoplar tests entre sí.

async function createPersistedUser(overrides: {
    email: string;
    role: UserRole;
    fullName?: string;
    dni?: string;
}): Promise<User> {
    const user = User.create({
        email: Email.create(overrides.email),
        fullName: overrides.fullName ?? "Test User",
        dni: overrides.dni,
        role: overrides.role,
        country: "AR",
        passwordHash: 'hash-de-prueba',
    });
    await userRepo.save(user);
    return user;
}

function createYouTubeStrategy() {
    return new YouTubeStrategy({
        monthlyRevenueUsd: Money.fromCents(50000, "USD"), // $500.00
        subscribers: 10000,
        growthFactor: 1.2,
        isMonetized: true,
        hasNoFaceContent: false,
        audienceTopCountry: "US",
    });
}

async function createPersistedListing(sellerId: UniqueEntityID): Promise<Listing> {
    const listing = Listing.create({
        sellerId,
        assetStrategy: createYouTubeStrategy(),
        askingPrice: Money.fromCents(1000000, "USD"),
        isBlind: true,
    });
    await listingRepo.save(listing);
    return listing;
}

// ── Cleanup ──────────────────────────────────────────────

beforeEach(async () => {
    // Respetar orden de FKs al limpiar
    await prisma.contract.deleteMany();
    await prisma.operation.deleteMany();
    await prisma.listing.deleteMany();
    await prisma.user.deleteMany();
});

afterAll(async () => {
    await prisma.contract.deleteMany();
    await prisma.operation.deleteMany();
    await prisma.listing.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
});

// ═════════════════════════════════════════════════════════
// User
// ═════════════════════════════════════════════════════════

describe("PrismaUserRepository", () => {
    it("debería persistir y recuperar un User con todos sus campos", async () => {
        const user = User.create({
            email: Email.create("buyer@test.com"),
            fullName: "Juan Perez",
            dni: "12345678",
            role: UserRole.BUYER,
            country: "AR",
            passwordHash: 'hash-de-prueba',
        });
        user.verifyKyc();

        await userRepo.save(user);
        const retrieved = await userRepo.findById(user.id.toString());

        expect(retrieved).not.toBeNull();
        expect(retrieved!.id.equals(user.id)).toBe(true);
        expect(retrieved!.email.getValue()).toBe("buyer@test.com");
        expect(retrieved!.role).toBe(UserRole.BUYER);
        expect(retrieved!.isKycVerified).toBe(true);
    });

    it("debería actualizar un User existente (upsert)", async () => {
        // 1. Crear sin KYC
        const user = User.create({
            email: Email.create("update@test.com"),
            fullName: "Sin KYC",
            dni: "99999999",
            role: UserRole.SELLER,
            passwordHash: 'hash-de-prueba',
        });
        await userRepo.save(user);

        const beforeUpdate = await userRepo.findById(user.id.toString());
        expect(beforeUpdate!.isKycVerified).toBe(false);

        // 2. Modificar y guardar de nuevo
        user.verifyKyc();
        await userRepo.save(user);

        // 3. Verificar que se actualizó
        const afterUpdate = await userRepo.findById(user.id.toString());
        expect(afterUpdate!.isKycVerified).toBe(true);
        expect(afterUpdate!.id.equals(user.id)).toBe(true);
    });

    it("debería devolver null si el User no existe", async () => {
        const result = await userRepo.findById(new UniqueEntityID().toString());
        expect(result).toBeNull();
    });
});

// ═════════════════════════════════════════════════════════
// Listing + Strategy (Polimorfismo JSON)
// ═════════════════════════════════════════════════════════

describe("PrismaListingRepository", () => {
    it("debería persistir un Listing y recuperar su Strategy hidratada correctamente", async () => {
        const seller = await createPersistedUser({
            email: "seller-listing@test.com",
            role: UserRole.SELLER,
        });

        const strategy = createYouTubeStrategy();
        const listing = Listing.create({
            sellerId: seller.id, // UniqueEntityID, no string
            assetStrategy: strategy,
            askingPrice: Money.fromCents(1000000, "USD"),
            isBlind: true,
        });

        await listingRepo.save(listing);
        const retrieved = await listingRepo.findById(listing.id.toString());

        expect(retrieved).not.toBeNull();

        // Verificar que askingPrice sobrevivió el round-trip
        expect(retrieved!.askingPrice.getCents()).toBe(1000000);
        expect(retrieved!.askingPrice.getCurrency()).toBe("USD");

        // Verificar que la strategy calcula correctamente post-hidratación
        expect(retrieved!.estimatedPrice.getCents()).toBeGreaterThan(0);

        // Verificar TODOS los campos de la strategy (round-trip completo)
        const retrievedData = (retrieved!.toSnapshot().props.assetStrategy as YouTubeStrategy).toJSON();
        const originalData = strategy.toJSON();

        expect(retrievedData.assetType).toBe("youtube");
        expect(retrievedData.assetData.subscribers).toBe(originalData.assetData.subscribers);
        expect(retrievedData.assetData.monthlyRevenueUsdCents).toBe(originalData.assetData.monthlyRevenueUsdCents);
        expect(retrievedData.assetData.currency).toBe(originalData.assetData.currency);
        expect(retrievedData.assetData.growthFactor).toBe(originalData.assetData.growthFactor);
        expect(retrievedData.assetData.isMonetized).toBe(originalData.assetData.isMonetized);
        expect(retrievedData.assetData.hasNoFaceContent).toBe(originalData.assetData.hasNoFaceContent);
        expect(retrievedData.assetData.audienceTopCountry).toBe(originalData.assetData.audienceTopCountry);
    });

    it("debería devolver null si el Listing no existe", async () => {
        const result = await listingRepo.findById(new UniqueEntityID().toString());
        expect(result).toBeNull();
    });
});

// ═════════════════════════════════════════════════════════
// Contract + Signatures (Tell, Don't Ask)
// ═════════════════════════════════════════════════════════

describe("PrismaContractRepository", () => {
    it("debería persistir un Contract con sus firmas y recuperar el estado correcto", async () => {
        const user = await createPersistedUser({
            email: "signer-contract@test.com",
            role: UserRole.BUYER,
        });
        const listing = await createPersistedListing(user.id);

        // Crear NDA con UniqueEntityID — no con string
        const nda = Contract.createBuyerNda(listing.id, user.id);
        nda.sign("buyer", "192.168.0.1");

        await contractRepo.save(nda);
        const retrieved = await contractRepo.findById(nda.id.toString());

        expect(retrieved).not.toBeNull();
        expect(retrieved!.type).toBe("buyer_nda");

        // Verificar estado de firmas via Tell Don't Ask
        expect(retrieved!.hasSignedBy("buyer")).toBe(true);
        expect(retrieved!.hasSignedBy("platform")).toBe(false);
        expect(retrieved!.isFullySigned()).toBe(false);

        // Verificar datos específicos de la firma
        const buyerSig = retrieved!.signatures.find(s => s.role === "buyer");
        expect(buyerSig).toBeDefined();
        expect(buyerSig!.signed).toBe(true);
        expect(buyerSig!.signatureIp).toBe("192.168.0.1");
        expect(buyerSig!.signedAt).toBeDefined();
    });

    it("debería actualizar un Contract cuando se agrega una firma nueva (UPDATE round-trip)", async () => {
        const user = await createPersistedUser({
            email: "signer-update@test.com",
            role: UserRole.BUYER,
        });
        const listing = await createPersistedListing(user.id);

        // 1. Crear y guardar con 0 firmas
        const nda = Contract.createBuyerNda(listing.id, user.id);
        await contractRepo.save(nda);

        const beforeSign = await contractRepo.findById(nda.id.toString());
        expect(beforeSign!.hasSignedBy("buyer")).toBe(false);
        expect(beforeSign!.isFullySigned()).toBe(false);

        // 2. Firmar buyer y guardar de nuevo
        nda.sign("buyer", "10.0.0.1");
        await contractRepo.save(nda);

        const afterBuyerSign = await contractRepo.findById(nda.id.toString());
        expect(afterBuyerSign!.hasSignedBy("buyer")).toBe(true);
        expect(afterBuyerSign!.hasSignedBy("platform")).toBe(false);
        expect(afterBuyerSign!.isFullySigned()).toBe(false);

        // 3. Firmar platform y guardar de nuevo
        nda.sign("platform", "10.0.0.2");
        await contractRepo.save(nda);

        const afterFullSign = await contractRepo.findById(nda.id.toString());
        expect(afterFullSign!.hasSignedBy("buyer")).toBe(true);
        expect(afterFullSign!.hasSignedBy("platform")).toBe(true);
        expect(afterFullSign!.isFullySigned()).toBe(true);

        // 4. Verificar que las IPs se preservaron en el JSON
        const sigs = afterFullSign!.signatures;
        expect(sigs.find(s => s.role === "buyer")!.signatureIp).toBe("10.0.0.1");
        expect(sigs.find(s => s.role === "platform")!.signatureIp).toBe("10.0.0.2");
    });

    it("debería devolver null si el Contract no existe", async () => {
        const result = await contractRepo.findById(new UniqueEntityID().toString());
        expect(result).toBeNull();
    });
});

// ═════════════════════════════════════════════════════════
// Operation + Negotiations (JSON round-trip)
// ═════════════════════════════════════════════════════════

describe("PrismaOperationRepository", () => {
    it("debería persistir una Operation con su oferta inicial y recuperarla", async () => {
        const buyer = await createPersistedUser({
            email: "buyer-op@test.com",
            role: UserRole.BUYER,
        });
        const seller = await createPersistedUser({
            email: "seller-op@test.com",
            role: UserRole.SELLER,
        });
        const listing = await createPersistedListing(seller.id);

        const operation = Operation.create({
            listingId: listing.id,
            buyerId: buyer.id,
            sellerId: seller.id,
            offerPrice: Money.fromCents(200000, "USD"),
        });

        await operationRepo.save(operation);
        const retrieved = await operationRepo.findById(operation.id.toString());

        expect(retrieved).not.toBeNull();
        expect(retrieved!.status).toBe("offer_sent");
        expect(retrieved!.currentOfferPrice.getCents()).toBe(200000);
        expect(retrieved!.pendingResponseFrom).toBe("seller");
        expect(retrieved!.negotiations).toHaveLength(1);
        expect(retrieved!.negotiations[0].proposedBy).toBe("buyer");
    });

    it("debería persistir contraofertas y recuperar el historial completo (UPDATE round-trip)", async () => {
        const buyer = await createPersistedUser({
            email: "buyer-neg@test.com",
            role: UserRole.BUYER,
        });
        const seller = await createPersistedUser({
            email: "seller-neg@test.com",
            role: UserRole.SELLER,
        });
        const listing = await createPersistedListing(seller.id);

        // 1. Crear con oferta del buyer
        const operation = Operation.create({
            listingId: listing.id,
            buyerId: buyer.id,
            sellerId: seller.id,
            offerPrice: Money.fromCents(100000, "USD"), // $1000
        });
        await operationRepo.save(operation);

        // 2. Seller contra-oferta
        operation.counterOffer(Money.fromCents(200000, "USD"), "seller");
        await operationRepo.save(operation);

        const afterCounter = await operationRepo.findById(operation.id.toString());
        expect(afterCounter!.status).toBe("negotiating");
        expect(afterCounter!.negotiations).toHaveLength(2);
        expect(afterCounter!.currentOfferPrice.getCents()).toBe(200000);
        expect(afterCounter!.pendingResponseFrom).toBe("buyer");

        // 3. Buyer contra-oferta
        operation.counterOffer(Money.fromCents(150000, "USD"), "buyer");
        await operationRepo.save(operation);

        // 4. Seller acepta
        operation.acceptCurrentOffer("seller");
        await operationRepo.save(operation);

        const afterAccept = await operationRepo.findById(operation.id.toString());
        expect(afterAccept!.status).toBe("contract_pending");
        expect(afterAccept!.finalPrice?.getCents()).toBe(150000);
        expect(afterAccept!.negotiations).toHaveLength(3);

        // Verificar que el historial tiene las fechas como Date
        expect(afterAccept!.negotiations[0].proposedAt).toBeInstanceOf(Date);
        expect(afterAccept!.negotiations[1].proposedAt).toBeInstanceOf(Date);
        expect(afterAccept!.negotiations[2].proposedAt).toBeInstanceOf(Date);
    });

    it("debería devolver null si la Operation no existe", async () => {
        const result = await operationRepo.findById(new UniqueEntityID().toString());
        expect(result).toBeNull();
    });
});

