import { describe, it, expect, beforeEach, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { UserRole } from "@marketplace/shared-types";
import { DEMO_USERS, ensureDemoUsers } from "../src/demoUsers";
import { PrismaUserRepository } from "../src/repositories/PrismaUserRepository";
import { prisma } from "../src/client";

const userRepo = new PrismaUserRepository();
// Un costo bajo alcanza para el test: lo que importa es que la clave sea el correo.
const hash = (password: string) => bcrypt.hash(password, 4);

async function clean() {
    await prisma.notification.deleteMany();
    await prisma.report.deleteMany();
    await prisma.contract.deleteMany();
    await prisma.operation.deleteMany();
    await prisma.listing.deleteMany();
    await prisma.user.deleteMany();
}

beforeEach(clean);

afterAll(async () => {
    await clean();
    await prisma.$disconnect();
});

describe("definiciones de los usuarios de demostración", () => {
    it("son seller3 y buyer3, con roles distintos y DNI únicos", () => {
        expect(DEMO_USERS.map((u) => u.email)).toEqual([
            "seller3@forzalabs.online",
            "buyer3@forzalabs.online",
        ]);
        expect(DEMO_USERS.map((u) => u.role)).toEqual([UserRole.SELLER, UserRole.BUYER]);
        expect(new Set(DEMO_USERS.map((u) => u.dni)).size).toBe(DEMO_USERS.length);
    });
});

describe("ensureDemoUsers", () => {
    it("crea los dos usuarios con KYC verificado y la contraseña igual al correo", async () => {
        const created = await ensureDemoUsers(userRepo, hash);

        expect(created).toEqual(DEMO_USERS.map((u) => u.email));
        for (const demo of DEMO_USERS) {
            const user = await userRepo.findByEmail(demo.email);
            expect(user).not.toBeNull();
            expect(user!.role).toBe(demo.role);
            expect(user!.isKycVerified).toBe(true);
            expect(await bcrypt.compare(demo.email, user!.passwordHash)).toBe(true);
        }
    });

    it("es idempotente: correrlo dos veces deja una sola fila por usuario", async () => {
        await ensureDemoUsers(userRepo, hash);
        const secondRun = await ensureDemoUsers(userRepo, hash);

        expect(secondRun).toEqual([]);
        expect(await prisma.user.count()).toBe(DEMO_USERS.length);
    });

    it("solo crea los que faltan", async () => {
        await ensureDemoUsers(userRepo, hash);
        await prisma.user.delete({ where: { email: "buyer3@forzalabs.online" } });

        const created = await ensureDemoUsers(userRepo, hash);

        expect(created).toEqual(["buyer3@forzalabs.online"]);
        expect(await prisma.user.count()).toBe(DEMO_USERS.length);
    });
});
