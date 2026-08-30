import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { UserRole } from "@marketplace/shared-types";
import { User } from "@marketplace/domain/src/entities/User";
import { Listing } from "@marketplace/domain/src/entities/Listing";
import { Email } from "@marketplace/domain/src/value-objects/Email";
import { Money } from "@marketplace/domain/src/value-objects/Money";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";
import { YouTubeStrategy } from "@marketplace/domain/src/strategies/YouTubeStrategy";
import { Actor } from "@marketplace/domain/src/ports/Actor";
import { ForbiddenError } from "@marketplace/domain/src/errors/DomainError";
import { SignNdaUseCase } from "@marketplace/domain/src/use-cases/contract/SignNdaUseCase";
import { GetListingDetailsUseCase } from "@marketplace/domain/src/use-cases/listing/GetListingDetailsUseCase";
import { PrismaUserRepository } from "../src/repositories/PrismaUserRepository";
import { PrismaListingRepository } from "../src/repositories/PrismaListingRepository";
import { PrismaContractRepository } from "../src/repositories/PrismaContractRepository";
import { PrismaOperationRepository } from "../src/repositories/PrismaOperationRepository";
import { ContractDataBuilder } from "@marketplace/domain/src/contracts/ContractDataBuilder";
import { prisma } from "../src/client";

/**
 * Flujo blind end-to-end SIN mocks.
 *
 * Los tests unitarios de la Fase 3 no detectaron que los listings blind nunca
 * se desbloqueaban: mockeaban el contractRepo y devolvían un contrato ya
 * firmado, así que el camino real SignNda → GetListingDetails jamás se
 * ejecutaba. Este archivo recorre ese camino contra la base real.
 */

const userRepo = new PrismaUserRepository();
const listingRepo = new PrismaListingRepository();
const contractRepo = new PrismaContractRepository();

// Una sola definición de qué entra en el documento, la misma que usa la API.
const armador = new ContractDataBuilder(userRepo, listingRepo, new PrismaOperationRepository());

const signNda = new SignNdaUseCase(contractRepo, listingRepo, userRepo, armador);
const getDetails = new GetListingDetailsUseCase(listingRepo, contractRepo);

// ── Helpers ──────────────────────────────────────────────

async function crearUsuario(email: string, role: UserRole, conKyc: boolean): Promise<User> {
    const user = User.create({
        email: Email.create(email),
        fullName: "Usuario de Prueba",
        dni: "20123456789",
        role,
        country: "AR",
        passwordHash: "hash-de-prueba",
    });
    if (conKyc) user.verifyKyc();
    await userRepo.save(user);
    return user;
}

async function crearListingBlindPublicado(sellerId: UniqueEntityID): Promise<Listing> {
    const listing = Listing.create({
        sellerId,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(120000, "USD"),
            subscribers: 55000,
            growthFactor: 1.1,
            isMonetized: true,
            hasNoFaceContent: true,
            audienceTopCountry: "US",
        }),
        askingPrice: Money.fromCents(1500000, "USD"),
        isBlind: true,
    });
    listing.submitForReview();
    listing.approve();
    await listingRepo.save(listing);
    return listing;
}

function actorDe(user: User, role: UserRole): Actor {
    return { id: user.id.toString(), role };
}

// ── Cleanup ──────────────────────────────────────────────

async function limpiar() {
    await prisma.contract.deleteMany();
    await prisma.operation.deleteMany();
    await prisma.listing.deleteMany();
    await prisma.user.deleteMany();
}

beforeEach(limpiar);

afterAll(async () => {
    await limpiar();
    await prisma.$disconnect();
});

// ═════════════════════════════════════════════════════════

describe("Flujo blind: NDA desbloquea los datos confidenciales", () => {
    it("oculta los campos confidenciales a un visitante anónimo", async () => {
        const seller = await crearUsuario("seller@test.com", UserRole.SELLER, true);
        const listing = await crearListingBlindPublicado(seller.id);

        const vista = await getDetails.execute(listing.id.toString());

        expect(vista.isBlind).toBe(true);
        expect(vista.hiddenFields.length).toBeGreaterThan(0);
        for (const campo of vista.hiddenFields) {
            expect(vista.assetData).not.toHaveProperty(campo);
        }
    });

    it("oculta los campos a un buyer que todavía no firmó el NDA", async () => {
        const seller = await crearUsuario("seller@test.com", UserRole.SELLER, true);
        const buyer = await crearUsuario("buyer@test.com", UserRole.BUYER, true);
        const listing = await crearListingBlindPublicado(seller.id);

        const vista = await getDetails.execute(
            listing.id.toString(),
            actorDe(buyer, UserRole.BUYER),
        );

        expect(vista.hiddenFields.length).toBeGreaterThan(0);
    });

    /**
     * El test que la Fase 3 no podía tener. Recorre SignNda y GetListingDetails
     * contra la base real: es el que habría detectado que la plataforma nunca
     * firmaba y el NDA quedaba incompleto para siempre.
     */
    it("revela los campos confidenciales después de firmar el NDA", async () => {
        const seller = await crearUsuario("seller@test.com", UserRole.SELLER, true);
        const buyer = await crearUsuario("buyer@test.com", UserRole.BUYER, true);
        const listing = await crearListingBlindPublicado(seller.id);
        const actor = actorDe(buyer, UserRole.BUYER);

        const nda = await signNda.execute(listing.id.toString(), "190.1.2.3", actor);

        expect(nda.type).toBe("buyer_nda");
        expect(nda.isFullySigned()).toBe(true);

        const vista = await getDetails.execute(listing.id.toString(), actor);

        expect(vista.hiddenFields).toHaveLength(0);
        expect(vista.assetData.subscribers).toBe(55000);
        expect(vista.assetData.monthlyRevenueUsdCents).toBe(120000);
    });

    it("el vendedor ve su propio activo sin necesidad de NDA", async () => {
        const seller = await crearUsuario("seller@test.com", UserRole.SELLER, true);
        const listing = await crearListingBlindPublicado(seller.id);

        const vista = await getDetails.execute(
            listing.id.toString(),
            actorDe(seller, UserRole.SELLER),
        );

        expect(vista.hiddenFields).toHaveLength(0);
        expect(vista.assetData.subscribers).toBe(55000);
    });

    it("no deja firmar el NDA sin KYC verificado", async () => {
        const seller = await crearUsuario("seller@test.com", UserRole.SELLER, true);
        const sinKyc = await crearUsuario("sinkyc@test.com", UserRole.BUYER, false);
        const listing = await crearListingBlindPublicado(seller.id);

        await expect(
            signNda.execute(listing.id.toString(), "190.1.2.3", actorDe(sinKyc, UserRole.BUYER)),
        ).rejects.toThrow(ForbiddenError);
    });

    /**
     * Round-trip real de la columna Json `signatures`: si el mapper no reviviera
     * los Date, `signedAt` volvería como string y esta aserción fallaría.
     */
    it("persiste las firmas con la fecha como Date, no como string", async () => {
        const seller = await crearUsuario("seller@test.com", UserRole.SELLER, true);
        const buyer = await crearUsuario("buyer@test.com", UserRole.BUYER, true);
        const listing = await crearListingBlindPublicado(seller.id);

        const nda = await signNda.execute(
            listing.id.toString(),
            "190.1.2.3",
            actorDe(buyer, UserRole.BUYER),
        );

        const recuperado = await contractRepo.findById(nda.id.toString());
        expect(recuperado).not.toBeNull();

        for (const firma of recuperado!.signatures) {
            expect(firma.signed).toBe(true);
            expect(firma.signedAt).toBeInstanceOf(Date);
            expect(Number.isNaN(firma.signedAt!.getTime())).toBe(false);
        }

        const firmaPlataforma = recuperado!.signatures.find((s) => s.role === "platform");
        expect(firmaPlataforma?.signatureIp).toBe("system");
    });
});

describe("El documento firmado sobrevive al round-trip", () => {
    /**
     * La firma solo significa algo si queda atada a un documento concreto.
     * Este test recorre el camino real: se firma, se guarda, se recupera de
     * Postgres y se comprueba que el hash del contrato y el de cada firma
     * siguen coincidiendo.
     */
    it("persiste el hash del contrato y el de cada firma", async () => {
        const seller = await crearUsuario("seller@test.com", UserRole.SELLER, true);
        const buyer = await crearUsuario("buyer@test.com", UserRole.BUYER, true);
        const listing = await crearListingBlindPublicado(seller.id);

        const nda = await signNda.execute(
            listing.id.toString(),
            "190.1.2.3",
            actorDe(buyer, UserRole.BUYER),
        );

        expect(nda.documentHash).toMatch(/^[0-9a-f]{64}$/);

        const recuperado = await contractRepo.findById(nda.id.toString());

        expect(recuperado!.documentHash).toBe(nda.documentHash);
        expect(recuperado!.signaturesMatchDocument()).toBe(true);

        for (const firma of recuperado!.signatures) {
            expect(firma.documentHash).toBe(nda.documentHash);
        }
    });

    it("dos contratos distintos tienen documentos distintos", async () => {
        const seller = await crearUsuario("seller@test.com", UserRole.SELLER, true);
        const buyer = await crearUsuario("buyer@test.com", UserRole.BUYER, true);
        const uno = await crearListingBlindPublicado(seller.id);
        const otro = await crearListingBlindPublicado(seller.id);

        const a = await signNda.execute(uno.id.toString(), "1.1.1.1", actorDe(buyer, UserRole.BUYER));
        const b = await signNda.execute(otro.id.toString(), "1.1.1.1", actorDe(buyer, UserRole.BUYER));

        expect(a.documentHash).not.toBe(b.documentHash);
    });
});
