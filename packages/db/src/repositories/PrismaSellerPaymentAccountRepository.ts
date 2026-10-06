import { ISellerPaymentAccountRepository } from "@marketplace/domain/src/ports/Repositories";
import { ISecretCipher } from "@marketplace/domain/src/ports/ISecretCipher";
import { SellerPaymentAccount } from "@marketplace/domain/src/entities/SellerPaymentAccount";
import { ValidationError } from "@marketplace/domain/src/errors/DomainError";
import { prisma } from "../client";
import { Prisma } from "../../generated/prisma/client";
import { SellerPaymentAccountMapper } from "../mappers/SellerPaymentAccountMapper";

/**
 * Indica si el error es la violación del índice único de `mpUserId`.
 *
 * Dónde viene el objetivo depende del motor: `meta.target` (arreglo de campos
 * o texto con el nombre del índice) o, con el adaptador de driver de Prisma 7,
 * `meta.driverAdapterError.cause` (campos de la restricción y mensaje del
 * driver con el nombre del índice). Se aceptan todas las formas.
 */
export function isMpUserIdConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        return false;
    }

    const meta = asRecord(error.meta);
    const cause = asRecord(asRecord(meta?.driverAdapterError)?.cause);
    const constraint = asRecord(cause?.constraint);

    return [meta?.target, constraint?.fields, constraint?.index, cause?.originalMessage]
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .some((value) => typeof value === "string" && value.includes("mpUserId"));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null
        ? Object.fromEntries(Object.entries(value))
        : undefined;
}

export class PrismaSellerPaymentAccountRepository implements ISellerPaymentAccountRepository {
    /**
     * El cifrador es obligatorio: sin él no hay forma de guardar un token. Se
     * declara antes que el cliente para que el cliente conserve su valor por
     * defecto, como en los demás repositorios.
     */
    constructor(
        private readonly cipher: ISecretCipher,
        private readonly db = prisma,
    ) {}

    async findByUserId(userId: string): Promise<SellerPaymentAccount | null> {
        const row = await this.db.sellerPaymentAccount.findUnique({ where: { userId } });
        return row ? SellerPaymentAccountMapper.toDomain(row, this.cipher) : null;
    }

    async findByMpUserId(mpUserId: string): Promise<SellerPaymentAccount | null> {
        const row = await this.db.sellerPaymentAccount.findUnique({ where: { mpUserId } });
        return row ? SellerPaymentAccountMapper.toDomain(row, this.cipher) : null;
    }

    /**
     * Solo cuenta filas: no lee ni descifra las columnas de tokens, así que
     * responde aunque la clave haya cambiado o la fila esté corrupta.
     */
    async existsByUserId(userId: string): Promise<boolean> {
        const filas = await this.db.sellerPaymentAccount.count({ where: { userId } });
        return filas > 0;
    }

    /**
     * Upsert por `userId`, no por `id`: vincular de nuevo crea una entidad con
     * otro id y tiene que pisar la fila anterior en vez de chocar con el
     * índice único.
     */
    async save(account: SellerPaymentAccount): Promise<void> {
        const data = SellerPaymentAccountMapper.toPersistence(account, this.cipher);

        try {
            await this.db.sellerPaymentAccount.upsert({
                where: { userId: data.userId },
                create: data,
                update: {
                    mpUserId: data.mpUserId,
                    accessTokenCipher: data.accessTokenCipher,
                    refreshTokenCipher: data.refreshTokenCipher,
                    expiresAt: data.expiresAt,
                    scope: data.scope,
                    linkedAt: data.linkedAt,
                },
            });
        } catch (error) {
            // Dos vinculaciones simultáneas de la misma cuenta pasan la
            // verificación del caso de uso; la segunda choca con el índice.
            // Con el upsert por `userId`, un choque sobre `userId` no puede
            // ocurrir: cualquier otro error se propaga sin cambios.
            if (isMpUserIdConflict(error)) {
                throw new ValidationError('Esa cuenta de Mercado Pago ya está vinculada a otro usuario.');
            }
            throw error;
        }
    }

    async deleteByUserId(userId: string): Promise<void> {
        await this.db.sellerPaymentAccount.deleteMany({ where: { userId } });
    }
}
