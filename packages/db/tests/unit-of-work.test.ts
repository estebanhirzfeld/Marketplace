import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { UserRole } from "@marketplace/shared-types";
import { User } from "@marketplace/domain/src/entities/User";
import { Listing } from "@marketplace/domain/src/entities/Listing";
import { Operation } from "@marketplace/domain/src/entities/Operation";
import { Email } from "@marketplace/domain/src/value-objects/Email";
import { Money } from "@marketplace/domain/src/value-objects/Money";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";
import { YouTubeStrategy } from "@marketplace/domain/src/strategies/YouTubeStrategy";
import { Actor } from "@marketplace/domain/src/ports/Actor";
import {
    IUnitOfWork,
    TransactionalRepositories,
} from "@marketplace/domain/src/ports/IUnitOfWork";
import { AcceptOfferUseCase } from "@marketplace/domain/src/use-cases/negotiation/AcceptOfferUseCase";
import { PrismaUnitOfWork } from "../src/PrismaUnitOfWork";
import { PrismaUserRepository } from "../src/repositories/PrismaUserRepository";
import { PrismaListingRepository } from "../src/repositories/PrismaListingRepository";
import { PrismaOperationRepository } from "../src/repositories/PrismaOperationRepository";
import { prisma } from "../src/client";

/**
 * Rollback real contra Postgres.
 *
 * Los tests de dominio verifican que el use case pida una transacción; solo
 * este archivo prueba que la transacción efectivamente revierte. Un doble no
 * puede demostrarlo: la garantía la da la base, no el código.
 */

const userRepo = new PrismaUserRepository();
const listingRepo = new PrismaListingRepository();
const operationRepo = new PrismaOperationRepository();

// ── Helpers ──────────────────────────────────────────────

async function crearUsuario(email: string, role: UserRole): Promise<User> {
    const user = User.create({
        email: Email.create(email),
        fullName: "Usuario UoW",
        dni: "20123456789",
        role,
        country: "AR",
        passwordHash: "hash-de-prueba",
    });
    user.verifyKyc();
    await userRepo.save(user);
    return user;
}

async function crearListingPublicado(sellerId: UniqueEntityID): Promise<Listing> {
    const listing = Listing.create({
        sellerId,
        assetStrategy: new YouTubeStrategy({
            monthlyRevenueUsd: Money.fromCents(120000, "USD"),
            subscribers: 55000,
            isMonetized: true,
        }),
        askingPrice: Money.fromCents(1500000, "USD"),
        isBlind: false,
    });
    listing.submitForReview();
    listing.approve();
    await listingRepo.save(listing);
    return listing;
}

async function crearOferta(
    listingId: UniqueEntityID,
    buyerId: UniqueEntityID,
    sellerId: UniqueEntityID,
    cents: number,
): Promise<Operation> {
    const op = Operation.create({
        listingId,
        buyerId,
        sellerId,
        offerPrice: Money.fromCents(cents, "USD"),
    });
    await operationRepo.save(op);
    return op;
}

/**
 * Unit of Work que rompe a propósito después de N escrituras de operación,
 * usando la transacción real de Prisma. Es inyección de fallas: la única forma
 * honesta de comprobar que la base revierte lo ya escrito.
 */
class UnitOfWorkQueFallaEn implements IUnitOfWork {
    constructor(private readonly escrituraQueFalla: number) {}

    async run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T> {
        let escrituras = 0;
        const real = new PrismaUnitOfWork();

        return real.run(async (repos) => {
            const operacionesConFalla = {
                ...repos.operations,
                findById: repos.operations.findById.bind(repos.operations),
                findByListing: repos.operations.findByListing.bind(repos.operations),
                save: async (op: Operation) => {
                    escrituras += 1;
                    if (escrituras === this.escrituraQueFalla) {
                        throw new Error("falla inyectada a mitad de la cascada");
                    }
                    return repos.operations.save(op);
                },
            };

            return work({ ...repos, operations: operacionesConFalla });
        });
    }
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

describe("PrismaUnitOfWork — atomicidad de la cascada multi-oferta", () => {
    it("commitea la cascada completa cuando todo sale bien", async () => {
        const seller = await crearUsuario("seller@uow.com", UserRole.SELLER);
        const b1 = await crearUsuario("b1@uow.com", UserRole.BUYER);
        const b2 = await crearUsuario("b2@uow.com", UserRole.BUYER);
        const b3 = await crearUsuario("b3@uow.com", UserRole.BUYER);
        const listing = await crearListingPublicado(seller.id);

        const aceptada = await crearOferta(listing.id, b1.id, seller.id, 100000);
        const rival1 = await crearOferta(listing.id, b2.id, seller.id, 120000);
        const rival2 = await crearOferta(listing.id, b3.id, seller.id, 90000);

        const actor: Actor = { id: seller.id.toString(), role: UserRole.SELLER };
        await new AcceptOfferUseCase(new PrismaUnitOfWork()).execute(
            aceptada.id.toString(),
            actor,
        );

        expect((await operationRepo.findById(aceptada.id.toString()))!.status)
            .toBe("contract_pending");
        expect((await operationRepo.findById(rival1.id.toString()))!.status)
            .toBe("cancelled");
        expect((await operationRepo.findById(rival2.id.toString()))!.status)
            .toBe("cancelled");
        expect((await listingRepo.findById(listing.id.toString()))!.status)
            .toBe("in_operation");
    });

    /**
     * El test que justifica toda la fase 4.1. Sin transacción, la oferta
     * aceptada ya estaría guardada como `contract_pending` cuando falla la
     * cancelación de la rival, dejando el estado inconsistente que el modelo
     * multi-oferta prohíbe.
     */
    it("revierte TODO si falla a mitad de la cascada", async () => {
        const seller = await crearUsuario("seller@uow.com", UserRole.SELLER);
        const b1 = await crearUsuario("b1@uow.com", UserRole.BUYER);
        const b2 = await crearUsuario("b2@uow.com", UserRole.BUYER);
        const listing = await crearListingPublicado(seller.id);

        const aceptada = await crearOferta(listing.id, b1.id, seller.id, 100000);
        const rival = await crearOferta(listing.id, b2.id, seller.id, 120000);

        const actor: Actor = { id: seller.id.toString(), role: UserRole.SELLER };

        // Falla en la segunda escritura: la aceptación ya se escribió, la
        // cancelación de la rival no.
        await expect(
            new AcceptOfferUseCase(new UnitOfWorkQueFallaEn(2)).execute(
                aceptada.id.toString(),
                actor,
            ),
        ).rejects.toThrow("falla inyectada");

        // Nada quedó escrito: los tres siguen como estaban antes.
        expect((await operationRepo.findById(aceptada.id.toString()))!.status)
            .toBe("offer_sent");
        expect((await operationRepo.findById(rival.id.toString()))!.status)
            .toBe("offer_sent");
        expect((await listingRepo.findById(listing.id.toString()))!.status)
            .toBe("published");
    });

    it("no deja comisiones calculadas a medias tras un rollback", async () => {
        const seller = await crearUsuario("seller@uow.com", UserRole.SELLER);
        const buyer = await crearUsuario("b1@uow.com", UserRole.BUYER);
        const listing = await crearListingPublicado(seller.id);
        const aceptada = await crearOferta(listing.id, buyer.id, seller.id, 100000);

        const actor: Actor = { id: seller.id.toString(), role: UserRole.SELLER };

        await expect(
            new AcceptOfferUseCase(new UnitOfWorkQueFallaEn(1)).execute(
                aceptada.id.toString(),
                actor,
            ),
        ).rejects.toThrow("falla inyectada");

        const recuperada = await operationRepo.findById(aceptada.id.toString());
        expect(recuperada!.finalPrice).toBeUndefined();
        expect(recuperada!.platformEarns).toBeUndefined();
    });
});
