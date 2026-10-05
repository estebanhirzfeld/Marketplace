import { ISellerPaymentAccountRepository } from "@marketplace/domain/src/ports/Repositories";
import { ISecretCipher } from "@marketplace/domain/src/ports/ISecretCipher";
import { SellerPaymentAccount } from "@marketplace/domain/src/entities/SellerPaymentAccount";
import { prisma } from "../client";
import { SellerPaymentAccountMapper } from "../mappers/SellerPaymentAccountMapper";

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

    /**
     * Upsert por `userId`, no por `id`: vincular de nuevo crea una entidad con
     * otro id y tiene que pisar la fila anterior en vez de chocar con el
     * índice único.
     */
    async save(account: SellerPaymentAccount): Promise<void> {
        const data = SellerPaymentAccountMapper.toPersistence(account, this.cipher);

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
    }

    async deleteByUserId(userId: string): Promise<void> {
        await this.db.sellerPaymentAccount.deleteMany({ where: { userId } });
    }
}
