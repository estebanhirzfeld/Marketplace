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
import { SettlementQuote } from "@marketplace/domain/src/value-objects/SettlementQuote";
import { PrismaOperationRepository } from "../src/repositories/PrismaOperationRepository";
import { Report } from "@marketplace/domain/src/entities/Report";
import { PrismaReportRepository } from "../src/repositories/PrismaReportRepository";
import { CustodyAccount } from "@marketplace/domain/src/entities/CustodyAccount";
import { PrismaCustodyAccountRepository } from "../src/repositories/PrismaCustodyAccountRepository";
import { SellerPaymentAccount } from "@marketplace/domain/src/entities/SellerPaymentAccount";
import { ISecretCipher } from "@marketplace/domain/src/ports/ISecretCipher";
import { PrismaSellerPaymentAccountRepository } from "../src/repositories/PrismaSellerPaymentAccountRepository";
import { AssetType } from "@marketplace/shared-types";
import { prisma } from "../src/client";
import { Prisma } from "../generated/prisma/client";

const userRepo = new PrismaUserRepository();
const listingRepo = new PrismaListingRepository();
const contractRepo = new PrismaContractRepository();
const operationRepo = new PrismaOperationRepository();
const reportRepo = new PrismaReportRepository();
const custodyRepo = new PrismaCustodyAccountRepository();

let custodySeq = 0;
async function createPersistedCustodyAccount(
    assetType: AssetType = AssetType.YOUTUBE,
): Promise<CustodyAccount> {
    custodySeq += 1;
    const account = CustodyAccount.create({
        label: `Custodia ${custodySeq}`,
        identifier: `custodia-${custodySeq}-${Date.now()}@test.com`,
        assetType,
    });
    await custodyRepo.save(account);
    return account;
}

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
    });
    await listingRepo.save(listing);
    return listing;
}

// ── Cleanup ──────────────────────────────────────────────

beforeEach(async () => {
    // Respetar orden de FKs al limpiar
    await prisma.report.deleteMany();
    await prisma.contract.deleteMany();
    await prisma.operation.deleteMany();
    await prisma.listing.deleteMany();
    await prisma.custodyAccount.deleteMany();
    await prisma.sellerPaymentAccount.deleteMany();
    await prisma.user.deleteMany();
});

afterAll(async () => {
    await prisma.sellerPaymentAccount.deleteMany();
    await prisma.report.deleteMany();
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

/**
 * La constancia de acceso vive en una columna Json. `accessSince` es la fecha
 * de la que depende todo el cálculo del plazo, así que si vuelve como string
 * en vez de Date el listing queda transferible o bloqueado por accidente.
 */
describe("PrismaListingRepository — constancia de acceso", () => {
    const DIA = 24 * 60 * 60 * 1000;

    it("debería persistir la constancia con las fechas como Date", async () => {
        const seller = await createPersistedUser({
            email: "seller-acceso@test.com",
            role: UserRole.SELLER,
        });
        const admin = await createPersistedUser({
            email: "admin-acceso@test.com",
            role: UserRole.ADMIN,
        });
        const listing = await createPersistedListing(seller.id);
        const cuenta = await createPersistedCustodyAccount();

        const sinAcceso = await listingRepo.findById(listing.id.toString());
        expect(sinAcceso!.platformAccess).toBeUndefined();
        expect(sinAcceso!.isReadyToTransfer()).toBe(false);

        listing.registerPlatformAccess({
            verifiedBy: admin.id,
            heldRole: 'manager',
            custodyAccountId: cuenta.id,
            accessSince: new Date(Date.now() - 9 * DIA),
            notes: "Invitada como administradora de la Cuenta de Marca.",
        });
        await listingRepo.save(listing);

        const conAcceso = await listingRepo.findById(listing.id.toString());
        const constancia = conAcceso!.platformAccess;

        expect(constancia).toBeDefined();
        expect(constancia!.verifiedBy.toString()).toBe(admin.id.toString());
        expect(constancia!.custodyAccountId?.toString()).toBe(cuenta.id.toString());
        expect(constancia!.verifiedAt).toBeInstanceOf(Date);
        expect(constancia!.accessSince).toBeInstanceOf(Date);
        expect(constancia!.notes).toBe("Invitada como administradora de la Cuenta de Marca.");
        // El rol vive en el Json y no en columna: no hay tabla a la que
        // apuntar, así que no hubo motivo para sacarlo.
        expect(constancia!.heldRole).toBe("manager");
        // Nueve días sobre una ventana de siete: ya se cumplió.
        expect(conAcceso!.isReadyToTransfer()).toBe(true);
    });

    /**
     * Revocar tiene que vaciar la columna de verdad. Con `undefined` Prisma
     * dejaría el update sin tocar el campo y la constancia sobreviviría a su
     * propia revocación.
     */
    it("debería borrar la constancia al revocar el acceso", async () => {
        const seller = await createPersistedUser({
            email: "seller-revoca@test.com",
            role: UserRole.SELLER,
        });
        const admin = await createPersistedUser({
            email: "admin-revoca@test.com",
            role: UserRole.ADMIN,
        });
        const listing = await createPersistedListing(seller.id);
        const cuenta = await createPersistedCustodyAccount();

        listing.registerPlatformAccess({
            verifiedBy: admin.id,
            heldRole: 'manager',
            custodyAccountId: cuenta.id,
            accessSince: new Date(Date.now() - 9 * DIA),
        });
        await listingRepo.save(listing);

        listing.revokePlatformAccess();
        await listingRepo.save(listing);

        const revocado = await listingRepo.findById(listing.id.toString());
        expect(revocado!.platformAccess).toBeUndefined();
        expect(revocado!.isReadyToTransfer()).toBe(false);

        // La columna FK también quedó en nulo: si sobreviviera, la cuenta
        // seguiría contando este activo como sostenido.
        const fila = await prisma.listing.findUnique({ where: { id: listing.id.toString() } });
        expect(fila!.custodyAccountId).toBeNull();
    });
});

// ═════════════════════════════════════════════════════════
// CustodyAccount
// ═════════════════════════════════════════════════════════

describe("PrismaCustodyAccountRepository", () => {
    it("hace ida y vuelta de una cuenta con todos sus campos", async () => {
        const cuenta = CustodyAccount.create({
            label: "Custodia YouTube 01",
            identifier: `custodia-rt-${Date.now()}@test.com`,
            assetType: AssetType.YOUTUBE,
            notes: "Cuenta de Marca principal.",
        });
        await custodyRepo.save(cuenta);

        const leida = await custodyRepo.findById(cuenta.id.toString());
        expect(leida).not.toBeNull();
        expect(leida!.label).toBe("Custodia YouTube 01");
        expect(leida!.identifier).toBe(cuenta.identifier);
        expect(leida!.assetType).toBe(AssetType.YOUTUBE);
        expect(leida!.isActive).toBe(true);
        expect(leida!.notes).toBe("Cuenta de Marca principal.");
    });

    it("un identifier duplicado falla", async () => {
        const identifier = `dup-${Date.now()}@test.com`;
        await custodyRepo.save(
            CustodyAccount.create({ label: "A", identifier, assetType: AssetType.YOUTUBE }),
        );
        await expect(
            custodyRepo.save(
                CustodyAccount.create({ label: "B", identifier, assetType: AssetType.WEB }),
            ),
        ).rejects.toThrow();
    });

    it("findActive filtra por isActive y opcionalmente por assetType", async () => {
        const activa = await createPersistedCustodyAccount(AssetType.YOUTUBE);
        const web = await createPersistedCustodyAccount(AssetType.WEB);
        const inactiva = await createPersistedCustodyAccount(AssetType.YOUTUBE);
        inactiva.deactivate(0);
        await custodyRepo.save(inactiva);

        const activasYt = await custodyRepo.findActive(AssetType.YOUTUBE);
        const ids = activasYt.map((c) => c.id.toString());
        expect(ids).toContain(activa.id.toString());
        expect(ids).not.toContain(web.id.toString());
        expect(ids).not.toContain(inactiva.id.toString());
    });

    it("findHeldBy devuelve los activos con acceso vigente apuntando a la cuenta y excluye los vendidos", async () => {
        const seller = await createPersistedUser({ email: `s-held-${Date.now()}@test.com`, role: UserRole.SELLER });
        const admin = await createPersistedUser({ email: `a-held-${Date.now()}@test.com`, role: UserRole.ADMIN });
        const cuenta = await createPersistedCustodyAccount();

        const vivo = await createPersistedListing(seller.id);
        vivo.registerPlatformAccess({ verifiedBy: admin.id, heldRole: 'manager',
            custodyAccountId: cuenta.id, accessSince: new Date(Date.now() - 9 * 86400000) });
        await listingRepo.save(vivo);

        const vendido = await createPersistedListing(seller.id);
        vendido.registerPlatformAccess({ verifiedBy: admin.id, heldRole: 'manager',
            custodyAccountId: cuenta.id, accessSince: new Date(Date.now() - 9 * 86400000) });
        vendido.submitForReview();
        vendido.approve();
        vendido.markInOperation();
        vendido.markSold();
        await listingRepo.save(vendido);

        const sostenidos = await listingRepo.findHeldBy(cuenta.id.toString());
        const ids = sostenidos.map((l) => l.id.toString());
        expect(ids).toContain(vivo.id.toString());
        expect(ids).not.toContain(vendido.id.toString());
    });

    it("un platformAccess con custodyAccountId NULL sigue siendo válido y transferible", async () => {
        const seller = await createPersistedUser({ email: `s-null-${Date.now()}@test.com`, role: UserRole.SELLER });
        const listing = await createPersistedListing(seller.id);

        // Simula una constancia previa a este cambio: Json sin la columna FK.
        await prisma.listing.update({
            where: { id: listing.id.toString() },
            data: {
                platformAccess: {
                    verifiedBy: seller.id.toString(),
                    verifiedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
                    accessSince: new Date(Date.now() - 10 * 86400000).toISOString(),
                    notes: null,
                },
                custodyAccountId: null,
            },
        });

        const leido = await listingRepo.findById(listing.id.toString());
        expect(leido!.platformAccess).toBeDefined();
        expect(leido!.platformAccess!.custodyAccountId).toBeUndefined();
        expect(leido!.isReadyToTransfer()).toBe(true);
    });
});

/**
 * La constancia de titularidad guarda el ingreso comprobado cuando la fuente lo
 * expone. Si el número no sobrevive el viaje a la columna Json, el comprador ve
 * el declarado creyendo que es el comprobado.
 */
describe("PrismaListingRepository — constancia de titularidad", () => {
    it("debería persistir la constancia con la fecha como Date", async () => {
        const seller = await createPersistedUser({
            email: "seller-own@test.com",
            role: UserRole.SELLER,
        });
        const listing = await createPersistedListing(seller.id);

        const sinConstancia = await listingRepo.findById(listing.id.toString());
        expect(sinConstancia!.isOwnershipVerified()).toBe(false);

        listing.registerOwnershipVerification({
            verifiedBy: seller.id,
            assetId: "UCq-Fj5jknLsUf-MWSy4_brA",
            source: "youtube",
        });
        await listingRepo.save(listing);

        const guardado = await listingRepo.findById(listing.id.toString());
        const constancia = guardado!.ownershipVerification;

        expect(guardado!.isOwnershipVerified()).toBe(true);
        expect(constancia!.verifiedAt).toBeInstanceOf(Date);
        expect(constancia!.assetId).toBe("UCq-Fj5jknLsUf-MWSy4_brA");
        expect(constancia!.source).toBe("youtube");
        // YouTube no expone el ingreso: la constancia no puede inventarlo.
        expect(constancia!.monthlyRevenueCents).toBeUndefined();
    });

    it("debería persistir el ingreso comprobado que devuelve AdSense", async () => {
        const seller = await createPersistedUser({
            email: "seller-ads@test.com",
            role: UserRole.SELLER,
        });
        const listing = await createPersistedListing(seller.id);

        listing.registerOwnershipVerification({
            verifiedBy: seller.id,
            assetId: "ejemplo.com",
            source: "adsense",
            monthlyRevenueCents: 78_450,
        });
        await listingRepo.save(listing);

        const guardado = await listingRepo.findById(listing.id.toString());

        expect(guardado!.ownershipVerification!.monthlyRevenueCents).toBe(78_450);
        expect(guardado!.ownershipVerification!.source).toBe("adsense");
    });
});

describe("PrismaContractRepository", () => {
    it("debería persistir un Contract con sus firmas y recuperar el estado correcto", async () => {
        const user = await createPersistedUser({
            email: "signer-contract@test.com",
            role: UserRole.BUYER,
        });
        const listing = await createPersistedListing(user.id);

        // Crear NDA con UniqueEntityID — no con string
        const nda = Contract.createBuyerNda(listing.id, user.id);
        // Sin documento adjunto la entidad rechaza cualquier firma.
        nda.attachDocument("a".repeat(64));
        // Un contrato sin documento no se puede firmar.
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
        // Sin documento adjunto la entidad rechaza cualquier firma.
        nda.attachDocument("a".repeat(64));
        // Un contrato sin documento no se puede firmar.
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

    /**
     * La constancia de custodia vive en una columna Json, así que el Date se
     * guarda como string ISO. Si no se revive al leer, `verifiedAt` vuelve
     * como texto y nadie se entera hasta que alguien la formatea.
     */
    it("debería persistir la verificación de custodia con la fecha como Date", async () => {
        const buyer = await createPersistedUser({
            email: "buyer-cust@test.com",
            role: UserRole.BUYER,
        });
        const seller = await createPersistedUser({
            email: "seller-cust@test.com",
            role: UserRole.SELLER,
        });
        const listing = await createPersistedListing(seller.id);
        const admin = await createPersistedUser({
            email: "admin-cust@test.com",
            role: UserRole.ADMIN,
        });

        const operation = Operation.create({
            listingId: listing.id,
            buyerId: buyer.id,
            sellerId: seller.id,
            offerPrice: Money.fromCents(500000, "USD"),
        });
        await operationRepo.save(operation);

        // Sin custodia todavía, la columna queda vacía.
        const sinCustodia = await operationRepo.findById(operation.id.toString());
        expect(sinCustodia!.custodyVerification).toBeUndefined();

        operation.acceptCurrentOffer("seller");
        operation.signContract();
        operation.initiateTransfer({ declaredBy: seller.id, controlCeded: true });
        operation.confirmAssetCustody({
            verifiedBy: admin.id,
            isPrimaryOwner: true,
            accessSecured: true,
            metrics: { suscriptores: 55000, vistas: 1200000 },
            notes: "Sin strikes activos.",
        });
        await operationRepo.save(operation);

        const conCustodia = await operationRepo.findById(operation.id.toString());
        const registro = conCustodia!.custodyVerification;

        expect(conCustodia!.status).toBe("asset_in_custody");
        expect(registro).toBeDefined();
        expect(registro!.verifiedBy.toString()).toBe(admin.id.toString());
        expect(registro!.verifiedAt).toBeInstanceOf(Date);
        expect(registro!.isPrimaryOwner).toBe(true);
        expect(registro!.accessSecured).toBe(true);
        expect(registro!.metrics.suscriptores).toBe(55000);
        expect(registro!.notes).toBe("Sin strikes activos.");
    });

    it("debería devolver null si la Operation no existe", async () => {
        const result = await operationRepo.findById(new UniqueEntityID().toString());
        expect(result).toBeNull();
    });

    /**
     * Las cotizaciones en pesos viajan a una columna Json como historial: se
     * guardan con la fecha de vencimiento en ISO y hay que revivirlas en orden.
     * Sin historial, la columna queda nula y se lee como "sin cotizaciones".
     */
    describe("settlementQuotes", () => {
        async function unaOperacionEnCustodia(prefix: string): Promise<Operation> {
            const buyer = await createPersistedUser({
                email: `buyer-${prefix}@test.com`,
                role: UserRole.BUYER,
            });
            const seller = await createPersistedUser({
                email: `seller-${prefix}@test.com`,
                role: UserRole.SELLER,
            });
            const admin = await createPersistedUser({
                email: `admin-${prefix}@test.com`,
                role: UserRole.ADMIN,
            });
            const listing = await createPersistedListing(seller.id);

            const operation = Operation.create({
                listingId: listing.id,
                buyerId: buyer.id,
                sellerId: seller.id,
                offerPrice: Money.fromCents(1_000_000, "USD"),
            });
            operation.acceptCurrentOffer("seller");
            operation.signContract();
            operation.initiateTransfer({ declaredBy: seller.id, controlCeded: true });
            operation.confirmAssetCustody({
                verifiedBy: admin.id,
                isPrimaryOwner: true,
                accessSecured: true,
                metrics: {},
            });
            return operation;
        }

        function unaCotizacion(operation: Operation, rate: number, now: Date): SettlementQuote {
            return SettlementQuote.create({
                buyerPays: operation.buyerPays!,
                sellerReceives: operation.sellerReceives!,
                exchangeRate: { rate, date: "2026-10-02", source: "BCRA_A3500" },
                now,
            });
        }

        it("debería persistir dos cotizaciones y leerlas en el mismo orden", async () => {
            const operation = await unaOperacionEnCustodia("cot-dos");
            const primera = unaCotizacion(operation, 1500, new Date("2026-10-05T12:00:00Z"));
            const segunda = unaCotizacion(operation, 1600, new Date("2026-10-07T12:00:00Z"));
            operation.quoteSettlement(primera);
            operation.quoteSettlement(segunda);

            await operationRepo.save(operation);
            const retrieved = await operationRepo.findById(operation.id.toString());

            expect(retrieved!.status).toBe("asset_in_custody");
            expect(retrieved!.settlementQuotes).toHaveLength(2);
            expect(retrieved!.settlementQuotes[0].rate).toBe(1500);
            expect(retrieved!.settlementQuotes[0].buyerPaysCents).toBe(primera.buyerPaysCents);
            expect(retrieved!.settlementQuotes[0].platformFeeCents).toBe(primera.platformFeeCents);
            expect(retrieved!.settlementQuotes[1].rate).toBe(1600);
            expect(retrieved!.settlementQuotes[1].buyerPaysCents).toBe(segunda.buyerPaysCents);
            expect(retrieved!.settlementQuotes[1].expiresAt).toBeInstanceOf(Date);
            expect(retrieved!.settlementQuotes[1].expiresAt.getTime()).toBe(segunda.expiresAt.getTime());
            expect(retrieved!.settlementQuote?.rate).toBe(1600);
        });

        it("debería leer una operación sin cotizaciones sin historial", async () => {
            const operation = await unaOperacionEnCustodia("cot-ninguna");

            await operationRepo.save(operation);
            const retrieved = await operationRepo.findById(operation.id.toString());

            expect(retrieved!.settlementQuotes).toHaveLength(0);
            expect(retrieved!.settlementQuote).toBeUndefined();
        });

        /**
         * Una columna escrita por fuera del repositorio (a mano, una migración
         * rota) tiene que fallar fuerte al leerla, no rehidratar basura.
         */
        describe("columna corrupta", () => {
            function unaEntradaValida() {
                return {
                    rate: 1500,
                    rateDate: "2026-10-02",
                    source: "BCRA_A3500",
                    currency: "ARS",
                    buyerPaysCents: 1_575_000_000,
                    sellerReceivesCents: 1_425_000_000,
                    platformFeeCents: 150_000_000,
                    expiresAt: "2026-10-06T12:00:00.000Z",
                };
            }

            async function leerConColumna(prefix: string, columna: Prisma.InputJsonValue) {
                const operation = await unaOperacionEnCustodia(prefix);
                await operationRepo.save(operation);
                await prisma.operation.update({
                    where: { id: operation.id.toString() },
                    data: { settlementQuotes: columna },
                });
                return operationRepo.findById(operation.id.toString());
            }

            it("la entrada válida escrita a mano se lee bien", async () => {
                const retrieved = await leerConColumna("cor-ok", [unaEntradaValida()]);

                expect(retrieved!.settlementQuotes).toHaveLength(1);
                expect(retrieved!.settlementQuotes[0].rate).toBe(1500);
            });

            it("rechaza una columna que no es un array", async () => {
                await expect(leerConColumna("cor-obj", { rate: 1500 })).rejects.toThrow(/corrupta/);
            });

            it("rechaza una entrada que no es un objeto", async () => {
                await expect(leerConColumna("cor-str", ["1500"])).rejects.toThrow(/corrupta/);
                await expect(leerConColumna("cor-nul", [null])).rejects.toThrow(/corrupta/);
                await expect(leerConColumna("cor-arr", [[1500]])).rejects.toThrow(/corrupta/);
            });

            it("rechaza una entrada sin un campo obligatorio", async () => {
                const { platformFeeCents: _omitido, ...incompleta } = unaEntradaValida();

                await expect(leerConColumna("cor-falta", [incompleta])).rejects.toThrow(/corrupta/);
            });

            it("rechaza una entrada con un campo de tipo equivocado", async () => {
                const entrada = { ...unaEntradaValida(), buyerPaysCents: "1575000000" };

                await expect(leerConColumna("cor-tipo", [entrada])).rejects.toThrow(/corrupta/);
            });

            it("rechaza una moneda que no es ARS", async () => {
                const entrada = { ...unaEntradaValida(), currency: "USD" };

                await expect(leerConColumna("cor-mon", [entrada])).rejects.toThrow(/corrupta/);
            });

            it("rechaza una fecha de vencimiento inválida", async () => {
                const entrada = { ...unaEntradaValida(), expiresAt: "no-es-una-fecha" };

                await expect(leerConColumna("cor-fecha", [entrada])).rejects.toThrow(/corrupta/);
            });

            it("rechaza una tasa que no es un número finito", async () => {
                // JSON no tiene NaN ni Infinity: lo más cercano que puede llegar
                // a la columna es un número fuera de rango, que `JSON.parse`
                // convierte en Infinity. Prisma no lo escribe (serializa a
                // `null`), así que va por SQL crudo.
                const texto = JSON.stringify([unaEntradaValida()]).replace("1500", "1e999");
                expect(JSON.parse(texto)[0].rate).toBe(Number.POSITIVE_INFINITY);

                const operation = await unaOperacionEnCustodia("cor-inf");
                await operationRepo.save(operation);
                await prisma.$executeRaw`UPDATE operations SET "settlementQuotes" = ${texto}::jsonb WHERE id = ${operation.id.toString()}`;

                await expect(operationRepo.findById(operation.id.toString())).rejects.toThrow(/corrupta/);
            });
        });
    });

    /**
     * La declaración de cesión del vendedor vive en una columna Json, espejo
     * de `custodyCheck`: el Date viaja como string ISO y hay que revivirlo.
     */
    it("debería persistir y leer de vuelta transferInitiation", async () => {
        const buyer = await createPersistedUser({
            email: "buyer-cesion@test.com",
            role: UserRole.BUYER,
        });
        const seller = await createPersistedUser({
            email: "seller-cesion@test.com",
            role: UserRole.SELLER,
        });
        const listing = await createPersistedListing(seller.id);
        const cuenta = new UniqueEntityID();

        const operation = Operation.create({
            listingId: listing.id,
            buyerId: buyer.id,
            sellerId: seller.id,
            offerPrice: Money.fromCents(500000, "USD"),
        });
        operation.acceptCurrentOffer("seller");
        operation.signContract();
        operation.initiateTransfer({
            declaredBy: seller.id,
            controlCeded: true,
            custodyAccountId: cuenta,
            notes: "Ya te promoví a propietario principal.",
        });
        await operationRepo.save(operation);

        const releida = await operationRepo.findById(operation.id.toString());
        const constancia = releida!.transferInitiation;

        expect(releida!.status).toBe("transfer_in_progress");
        expect(constancia).toBeDefined();
        expect(constancia!.declaredBy.toString()).toBe(seller.id.toString());
        expect(constancia!.declaredAt).toBeInstanceOf(Date);
        expect(constancia!.controlCeded).toBe(true);
        expect(constancia!.custodyAccountId?.toString()).toBe(cuenta.toString());
        expect(constancia!.notes).toBe("Ya te promoví a propietario principal.");
    });

    /**
     * Las operaciones que ya estaban en `transfer_in_progress` antes de este
     * cambio quedan con la columna en NULL. Rehidratarlas no debe romper:
     * es la "declaración sin registrar", no un dato corrupto.
     */
    it("una operación en transfer_in_progress con transferInitiation en NULL se rehidrata sin romper", async () => {
        const buyer = await createPersistedUser({
            email: "buyer-sinreg@test.com",
            role: UserRole.BUYER,
        });
        const seller = await createPersistedUser({
            email: "seller-sinreg@test.com",
            role: UserRole.SELLER,
        });
        const listing = await createPersistedListing(seller.id);

        const operation = Operation.create({
            listingId: listing.id,
            buyerId: buyer.id,
            sellerId: seller.id,
            offerPrice: Money.fromCents(500000, "USD"),
        });
        operation.acceptCurrentOffer("seller");
        operation.signContract();
        await operationRepo.save(operation);

        // Simula una fila anterior a este cambio: el estado ya avanzó pero la
        // columna nunca se escribió (queda en su NULL por defecto).
        await prisma.operation.update({
            where: { id: operation.id.toString() },
            data: { status: "transfer_in_progress" },
        });

        const releida = await operationRepo.findById(operation.id.toString());

        expect(releida!.status).toBe("transfer_in_progress");
        expect(releida!.transferInitiation).toBeUndefined();
    });

    /**
     * `custodyVerification.custodyAccountId` estaba declarado en el mapper —lo
     * leía y lo escribía— pero nunca se probó la ida y vuelta real: el defecto
     * que motivó cablearlo en `ConfirmCustodyUseCase` es exactamente que nada
     * lo comprobaba contra la base.
     */
    it("debería persistir y leer de vuelta custodyVerification.custodyAccountId", async () => {
        const buyer = await createPersistedUser({
            email: "buyer-cuenta@test.com",
            role: UserRole.BUYER,
        });
        const seller = await createPersistedUser({
            email: "seller-cuenta@test.com",
            role: UserRole.SELLER,
        });
        const listing = await createPersistedListing(seller.id);
        const admin = await createPersistedUser({
            email: "admin-cuenta@test.com",
            role: UserRole.ADMIN,
        });
        const cuenta = new UniqueEntityID();

        const operation = Operation.create({
            listingId: listing.id,
            buyerId: buyer.id,
            sellerId: seller.id,
            offerPrice: Money.fromCents(500000, "USD"),
        });
        operation.acceptCurrentOffer("seller");
        operation.signContract();
        operation.initiateTransfer({ declaredBy: seller.id, controlCeded: true });
        operation.confirmAssetCustody({
            verifiedBy: admin.id,
            isPrimaryOwner: true,
            accessSecured: true,
            metrics: {},
            custodyAccountId: cuenta,
        });
        await operationRepo.save(operation);

        const releida = await operationRepo.findById(operation.id.toString());

        expect(releida!.custodyVerification?.custodyAccountId?.toString()).toBe(cuenta.toString());
    });
});

// ═════════════════════════════════════════════════════════
// Denuncias
// ═════════════════════════════════════════════════════════

describe("PrismaReportRepository", () => {
    async function unaOperacionFirmada() {
        const buyer = await createPersistedUser({
            email: "buyer-rep@test.com",
            role: UserRole.BUYER,
        });
        const seller = await createPersistedUser({
            email: "seller-rep@test.com",
            role: UserRole.SELLER,
        });
        const listing = await createPersistedListing(seller.id);

        const operation = Operation.create({
            listingId: listing.id,
            buyerId: buyer.id,
            sellerId: seller.id,
            offerPrice: Money.fromCents(1_500_000, "USD"),
        });
        operation.acceptCurrentOffer("seller");
        operation.signContract();
        await operationRepo.save(operation);

        return { operation, buyer, seller };
    }

    it("debería persistir una denuncia y recuperarla", async () => {
        const { operation, buyer, seller } = await unaOperacionFirmada();

        const report = Report.create({
            operationId: operation.id,
            reportedBy: buyer.id,
            reporterRole: "buyer",
            reportedUserId: seller.id,
            reason: "ingreso_falso",
            detail: "El canal factura mucho menos de lo que decía la publicación.",
        });
        await reportRepo.save(report);

        const guardada = await reportRepo.findById(report.id.toString());

        expect(guardada!.status).toBe("open");
        expect(guardada!.reason).toBe("ingreso_falso");
        expect(guardada!.reporterRole).toBe("buyer");
        expect(guardada!.reportedUserId.toString()).toBe(seller.id.toString());
    });

    /** Las dos puntas: el denunciado también la ve en su listado. */
    it("debería encontrarla desde cualquiera de las dos partes", async () => {
        const { operation, buyer, seller } = await unaOperacionFirmada();

        const report = Report.create({
            operationId: operation.id,
            reportedBy: buyer.id,
            reporterRole: "buyer",
            reportedUserId: seller.id,
            reason: "otro",
            detail: "Algo no cerró en esta operación y quiero dejarlo asentado.",
        });
        await reportRepo.save(report);

        expect(await reportRepo.findByUser(buyer.id.toString())).toHaveLength(1);
        expect(await reportRepo.findByUser(seller.id.toString())).toHaveLength(1);
    });

    it("debería persistir el cierre con su motivo", async () => {
        const { operation, buyer, seller } = await unaOperacionFirmada();

        const report = Report.create({
            operationId: operation.id,
            reportedBy: buyer.id,
            reporterRole: "buyer",
            reportedUserId: seller.id,
            reason: "otro",
            detail: "Algo no cerró en esta operación y quiero dejarlo asentado.",
        });
        await reportRepo.save(report);

        report.close("Nos arreglamos entre las partes.");
        await reportRepo.save(report);

        const guardada = await reportRepo.findById(report.id.toString());

        expect(guardada!.status).toBe("closed");
        expect(guardada!.closedAt).toBeInstanceOf(Date);
        expect(guardada!.closedReason).toBe("Nos arreglamos entre las partes.");
    });
});

// ═════════════════════════════════════════════════════════
// Cuenta de Mercado Pago del vendedor
// ═════════════════════════════════════════════════════════

/**
 * Cifrador de prueba, reversible y reconocible: no es seguro, solo permite
 * comprobar que el repositorio cifra al guardar y descifra al leer sin traer
 * la implementación real (vive en apps/api).
 */
class FakeCipher implements ISecretCipher {
    encrypt(plain: string): string {
        return `fake:${Buffer.from(plain, "utf8").reverse().toString("base64")}`;
    }
    decrypt(payload: string): string {
        if (!payload.startsWith("fake:")) throw new Error("payload ajeno");
        return Buffer.from(payload.slice(5), "base64").reverse().toString("utf8");
    }
}

describe("PrismaSellerPaymentAccountRepository", () => {
    const paymentRepo = new PrismaSellerPaymentAccountRepository(new FakeCipher());
    const VENCE = new Date("2030-01-01T00:00:00.000Z");
    const VINCULADA = new Date("2026-10-05T12:00:00.000Z");

    function unaCuenta(userId: UniqueEntityID, overrides: { accessToken?: string; refreshToken?: string } = {}) {
        return SellerPaymentAccount.create({
            userId,
            mpUserId: "mp-123",
            accessToken: overrides.accessToken ?? "APP_USR-token-en-claro",
            refreshToken: overrides.refreshToken ?? "TG-refresco-en-claro",
            expiresAt: VENCE,
            scope: "offline_access read write",
            linkedAt: VINCULADA,
        });
    }

    it("ida y vuelta: guarda y recupera la cuenta con los tokens en claro", async () => {
        const seller = await createPersistedUser({ email: "mp-rt@test.com", role: UserRole.SELLER });
        const cuenta = unaCuenta(seller.id);

        await paymentRepo.save(cuenta);
        const leida = await paymentRepo.findByUserId(seller.id.toString());

        expect(leida).not.toBeNull();
        expect(leida!.id.equals(cuenta.id)).toBe(true);
        expect(leida!.userId.equals(seller.id)).toBe(true);
        expect(leida!.mpUserId).toBe("mp-123");
        expect(leida!.accessToken).toBe("APP_USR-token-en-claro");
        expect(leida!.refreshToken).toBe("TG-refresco-en-claro");
        expect(leida!.expiresAt).toEqual(VENCE);
        expect(leida!.scope).toBe("offline_access read write");
        expect(leida!.linkedAt).toEqual(VINCULADA);
    });

    it("las columnas guardadas no contienen el texto plano de los tokens", async () => {
        const seller = await createPersistedUser({ email: "mp-raw@test.com", role: UserRole.SELLER });
        await paymentRepo.save(unaCuenta(seller.id));

        const filas = await prisma.$queryRaw<
            Array<{ accessTokenCipher: string; refreshTokenCipher: string }>
        >`SELECT "accessTokenCipher", "refreshTokenCipher" FROM seller_payment_accounts WHERE "userId" = ${seller.id.toString()}`;

        expect(filas).toHaveLength(1);
        expect(filas[0].accessTokenCipher).not.toContain("APP_USR-token-en-claro");
        expect(filas[0].refreshTokenCipher).not.toContain("TG-refresco-en-claro");
        expect(filas[0].accessTokenCipher.startsWith("fake:")).toBe(true);
        expect(filas[0].refreshTokenCipher.startsWith("fake:")).toBe(true);
    });

    it("devuelve null si el usuario no vinculó nada", async () => {
        const seller = await createPersistedUser({ email: "mp-none@test.com", role: UserRole.SELLER });

        expect(await paymentRepo.findByUserId(seller.id.toString())).toBeNull();
    });

    it("existsByUserId distingue si hay cuenta vinculada", async () => {
        const vinculado = await createPersistedUser({ email: "mp-ex-si@test.com", role: UserRole.SELLER });
        const sinVincular = await createPersistedUser({ email: "mp-ex-no@test.com", role: UserRole.SELLER });
        await paymentRepo.save(unaCuenta(vinculado.id));

        expect(await paymentRepo.existsByUserId(vinculado.id.toString())).toBe(true);
        expect(await paymentRepo.existsByUserId(sinVincular.id.toString())).toBe(false);
    });

    it("existsByUserId no descifra: responde aunque la fila no se pueda descifrar", async () => {
        const seller = await createPersistedUser({ email: "mp-ex-corrupta@test.com", role: UserRole.SELLER });
        await paymentRepo.save(unaCuenta(seller.id));
        // Simula la clave rotada o una fila corrupta: el texto cifrado ya no es
        // válido para el cifrador.
        await prisma.sellerPaymentAccount.update({
            where: { userId: seller.id.toString() },
            data: { accessTokenCipher: "basura-ilegible" },
        });

        await expect(paymentRepo.findByUserId(seller.id.toString())).rejects.toThrow();
        expect(await paymentRepo.existsByUserId(seller.id.toString())).toBe(true);
    });

    it("vincular de nuevo reemplaza la cuenta anterior (upsert por usuario)", async () => {
        const seller = await createPersistedUser({ email: "mp-relink@test.com", role: UserRole.SELLER });
        await paymentRepo.save(unaCuenta(seller.id));

        await paymentRepo.save(
            unaCuenta(seller.id, { accessToken: "token-nuevo", refreshToken: "refresco-nuevo" }),
        );

        expect(await prisma.sellerPaymentAccount.count({ where: { userId: seller.id.toString() } })).toBe(1);
        const leida = await paymentRepo.findByUserId(seller.id.toString());
        expect(leida!.accessToken).toBe("token-nuevo");
        expect(leida!.refreshToken).toBe("refresco-nuevo");
    });

    it("guardar una cuenta renovada actualiza los tokens", async () => {
        const seller = await createPersistedUser({ email: "mp-renew@test.com", role: UserRole.SELLER });
        const cuenta = unaCuenta(seller.id);
        await paymentRepo.save(cuenta);

        cuenta.renew({
            accessToken: "renovado",
            refreshToken: "refresco-renovado",
            expiresAt: new Date("2031-01-01T00:00:00.000Z"),
            now: new Date("2026-10-06T00:00:00.000Z"),
        });
        await paymentRepo.save(cuenta);

        const leida = await paymentRepo.findByUserId(seller.id.toString());
        expect(leida!.accessToken).toBe("renovado");
        expect(leida!.expiresAt).toEqual(new Date("2031-01-01T00:00:00.000Z"));
    });

    it("deleteByUserId borra la cuenta y no falla si no existe", async () => {
        const seller = await createPersistedUser({ email: "mp-del@test.com", role: UserRole.SELLER });
        await paymentRepo.save(unaCuenta(seller.id));

        await paymentRepo.deleteByUserId(seller.id.toString());
        expect(await paymentRepo.findByUserId(seller.id.toString())).toBeNull();

        await expect(paymentRepo.deleteByUserId(seller.id.toString())).resolves.toBeUndefined();
    });

    it("una cuenta por usuario: la base rechaza una segunda fila", async () => {
        const seller = await createPersistedUser({ email: "mp-uniq@test.com", role: UserRole.SELLER });
        await paymentRepo.save(unaCuenta(seller.id));

        await expect(
            prisma.sellerPaymentAccount.create({
                data: {
                    userId: seller.id.toString(),
                    mpUserId: "otro",
                    accessTokenCipher: "x",
                    refreshTokenCipher: "y",
                    expiresAt: VENCE,
                    scope: "s",
                    linkedAt: VINCULADA,
                },
            }),
        ).rejects.toThrow();
    });

    it("borrar al usuario borra su cuenta en cascada", async () => {
        const seller = await createPersistedUser({ email: "mp-cascade@test.com", role: UserRole.SELLER });
        await paymentRepo.save(unaCuenta(seller.id));

        await prisma.user.delete({ where: { id: seller.id.toString() } });

        expect(await prisma.sellerPaymentAccount.count()).toBe(0);
    });

    it("no mezcla cuentas de usuarios distintos", async () => {
        const a = await createPersistedUser({ email: "mp-a@test.com", role: UserRole.SELLER });
        const b = await createPersistedUser({ email: "mp-b@test.com", role: UserRole.SELLER });
        await paymentRepo.save(unaCuenta(a.id, { accessToken: "token-a" }));
        await paymentRepo.save(unaCuenta(b.id, { accessToken: "token-b" }));

        expect((await paymentRepo.findByUserId(a.id.toString()))!.accessToken).toBe("token-a");
        expect((await paymentRepo.findByUserId(b.id.toString()))!.accessToken).toBe("token-b");
    });
});
