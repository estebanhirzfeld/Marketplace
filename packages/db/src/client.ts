import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

/**
 * Lo mínimo que un repositorio necesita de Prisma.
 *
 * Se define estructuralmente en vez de usar el tipo nominal del cliente
 * transaccional: así el mismo repositorio acepta tanto el singleton como el
 * cliente que entrega `$transaction`, sin casts ni uniones.
 */
export type PrismaLike = Pick<PrismaClient, "user" | "listing" | "operation" | "contract">;

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
