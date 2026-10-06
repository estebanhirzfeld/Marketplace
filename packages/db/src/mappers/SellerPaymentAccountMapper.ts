import type { SellerPaymentAccount as PrismaSellerPaymentAccount } from "../../generated/prisma/client";
import { SellerPaymentAccount } from "@marketplace/domain/src/entities/SellerPaymentAccount";
import { ISecretCipher } from "@marketplace/domain/src/ports/ISecretCipher";
import { UniqueEntityID } from "@marketplace/domain/src/value-objects/UniqueEntityID";

/**
 * El cifrado vive en este borde: el dominio maneja los tokens en claro y la
 * base solo ve texto cifrado. Por eso el mapper recibe el cifrador.
 */
export class SellerPaymentAccountMapper {
    public static toDomain(raw: PrismaSellerPaymentAccount, cipher: ISecretCipher): SellerPaymentAccount {
        return SellerPaymentAccount.reconstitute(
            {
                userId: new UniqueEntityID(raw.userId),
                mpUserId: raw.mpUserId,
                accessToken: cipher.decrypt(raw.accessTokenCipher),
                refreshToken: cipher.decrypt(raw.refreshTokenCipher),
                expiresAt: raw.expiresAt,
                scope: raw.scope,
                linkedAt: raw.linkedAt,
            },
            new UniqueEntityID(raw.id),
            // La tabla no guarda `createdAt`: `linkedAt` es el alta de la cuenta.
            raw.linkedAt,
        );
    }

    public static toPersistence(account: SellerPaymentAccount, cipher: ISecretCipher) {
        const { id, props } = account.toSnapshot();

        return {
            id,
            userId: props.userId.toString(),
            mpUserId: props.mpUserId,
            accessTokenCipher: cipher.encrypt(props.accessToken),
            refreshTokenCipher: cipher.encrypt(props.refreshToken),
            expiresAt: props.expiresAt,
            scope: props.scope,
            linkedAt: props.linkedAt,
        };
    }
}
