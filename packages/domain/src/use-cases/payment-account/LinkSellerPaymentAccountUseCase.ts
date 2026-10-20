import { UserRole } from '@marketplace/shared-types';
import { ISellerPaymentAccountRepository } from '../../ports/Repositories';
import { IMercadoPagoOAuthClient, MercadoPagoTokens } from '../../ports/IMercadoPagoOAuthClient';
import { Actor } from '../../ports/Actor';
import { SellerPaymentAccount } from '../../entities/SellerPaymentAccount';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
import { ForbiddenError, ValidationError } from '../../errors/DomainError';

export interface LinkSellerPaymentAccountInput {
    /** El código que Mercado Pago entregó al volver; vale 10 minutos y es de un solo uso. */
    code: string;
    /** El verificador PKCE con el que se generó el desafío del pedido. */
    codeVerifier: string;
}

/**
 * El vendedor vincula su cuenta de Mercado Pago para cobrar sus ventas.
 *
 * Vincular de nuevo reemplaza la cuenta anterior. El admin es operador puro:
 * no vende, así que no tiene nada que cobrar.
 */
export class LinkSellerPaymentAccountUseCase {
    constructor(
        private readonly accounts: ISellerPaymentAccountRepository,
        private readonly oauth: IMercadoPagoOAuthClient,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(input: LinkSellerPaymentAccountInput, actor: Actor): Promise<void> {
        if (actor.role === UserRole.ADMIN) {
            throw new ForbiddenError('Un administrador no puede vincular una cuenta de Mercado Pago.');
        }

        let tokens: MercadoPagoTokens;
        try {
            tokens = await this.oauth.exchangeCode({
                code: input.code,
                codeVerifier: input.codeVerifier,
            });
        } catch {
            // El error original puede traer el código, el verificador o el
            // secreto de la aplicación: no se propaga.
            throw new ValidationError(
                'No pudimos vincular tu cuenta de Mercado Pago: el permiso venció o ya se usó. Probá de nuevo.',
            );
        }

        // Una cuenta de Mercado Pago pertenece a un solo usuario: si dos
        // pudieran vincular la misma, un aviso de pago no permitiría saber a
        // quién se le cobró. Vincular de nuevo la propia cuenta sí se permite.
        const existing = await this.accounts.findByMpUserId(tokens.mpUserId);
        if (existing && existing.userId.toString() !== actor.id) {
            throw new ValidationError('Esa cuenta de Mercado Pago ya está vinculada a otro usuario.');
        }

        const now = this.now();
        const account = SellerPaymentAccount.create({
            userId: new UniqueEntityID(actor.id),
            mpUserId: tokens.mpUserId,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: new Date(now.getTime() + tokens.expiresInSeconds * 1000),
            scope: tokens.scope,
            linkedAt: now,
        });

        await this.accounts.save(account);
    }
}
