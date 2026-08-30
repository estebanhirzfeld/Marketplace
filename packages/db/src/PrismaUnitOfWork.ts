import { IUnitOfWork, TransactionalRepositories } from "@marketplace/domain/src/ports/IUnitOfWork";
import { prisma } from "./client";
import { PrismaUserRepository } from "./repositories/PrismaUserRepository";
import { PrismaListingRepository } from "./repositories/PrismaListingRepository";
import { PrismaOperationRepository } from "./repositories/PrismaOperationRepository";
import { PrismaContractRepository } from "./repositories/PrismaContractRepository";

/**
 * Unit of Work sobre `$transaction` de Prisma.
 *
 * Construye repositorios nuevos atados al cliente transaccional, así que todo
 * lo que el bloque escriba vive o muere junto. Si el callback lanza, Prisma
 * hace rollback y el error sube sin tocar: revertir es de la transacción, no
 * del use case.
 */
export class PrismaUnitOfWork implements IUnitOfWork {
    async run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T> {
        return prisma.$transaction(async (tx) => {
            const repos: TransactionalRepositories = {
                users: new PrismaUserRepository(tx),
                listings: new PrismaListingRepository(tx),
                operations: new PrismaOperationRepository(tx),
                contracts: new PrismaContractRepository(tx),
            };

            return work(repos);
        });
    }
}
