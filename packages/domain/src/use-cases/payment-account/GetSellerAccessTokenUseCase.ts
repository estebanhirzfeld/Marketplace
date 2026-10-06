import { ISellerPaymentAccountRepository } from '../../ports/Repositories';
import { IMercadoPagoOAuthClient } from '../../ports/IMercadoPagoOAuthClient';
import { InvalidStateError, NotFoundError } from '../../errors/DomainError';

/** Si el token vence dentro de esta ventana se renueva antes de usarlo. */
const REFRESH_WINDOW_MS = 5 * 60 * 1000;

/**
 * Entrega un token de acceso válido del vendedor para cobrar a su nombre.
 *
 * El refresco es perezoso: solo ocurre cuando el token está por vencer. Como
 * Mercado Pago rota el token de renovación en cada uso, dos refrescos
 * simultáneos del mismo vendedor harían que el segundo use un token ya
 * invalidado. Por eso toda la resolución (leer, decidir, refrescar, guardar)
 * se serializa por usuario con un mapa de promesas en vuelo.
 *
 * Alcance: en proceso. Con varias instancias de la API haría falta un candado
 * compartido; hoy hay una sola.
 */
export class GetSellerAccessTokenUseCase {
    private readonly inFlight = new Map<string, Promise<string>>();

    constructor(
        private readonly accounts: ISellerPaymentAccountRepository,
        private readonly oauth: IMercadoPagoOAuthClient,
        private readonly now: () => Date = () => new Date(),
    ) {}

    execute(userId: string): Promise<string> {
        const enCurso = this.inFlight.get(userId);
        if (enCurso) {
            return enCurso;
        }

        const resolucion = this.resolve(userId).finally(() => {
            this.inFlight.delete(userId);
        });
        this.inFlight.set(userId, resolucion);
        return resolucion;
    }

    private async resolve(userId: string): Promise<string> {
        const account = await this.accounts.findByUserId(userId);
        if (!account) {
            throw new NotFoundError('El vendedor no vinculó su cuenta de Mercado Pago.');
        }

        const now = this.now();
        if (account.expiresAt.getTime() - now.getTime() > REFRESH_WINDOW_MS) {
            return account.accessToken;
        }

        try {
            const tokens = await this.oauth.refresh(account.refreshToken);
            account.renew({
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresAt: new Date(now.getTime() + tokens.expiresInSeconds * 1000),
                now,
            });
        } catch {
            // No se borra la cuenta: puede ser una caída momentánea de Mercado
            // Pago, y desvincular por eso le quitaría al vendedor el requisito
            // para publicar. El mensaje no incluye el error original.
            throw new InvalidStateError(
                'No pudimos renovar el permiso de Mercado Pago del vendedor. Tiene que volver a vincular su cuenta.',
            );
        }

        await this.accounts.save(account);
        return account.accessToken;
    }
}
