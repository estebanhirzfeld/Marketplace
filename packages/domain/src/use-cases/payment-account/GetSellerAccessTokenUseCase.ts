import { ISellerPaymentAccountRepository } from '../../ports/Repositories';
import { IMercadoPagoOAuthClient } from '../../ports/IMercadoPagoOAuthClient';
import { ISellerAccessTokenSource } from '../../ports/ISellerAccessTokenSource';
import { SellerPaymentAccount } from '../../entities/SellerPaymentAccount';
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
export class GetSellerAccessTokenUseCase implements ISellerAccessTokenSource {
    private readonly inFlight = new Map<string, Promise<string>>();
    /** Cuentas renovadas cuyo guardado falló: no se pierden mientras el proceso viva. */
    private readonly unsaved = new Map<string, SellerPaymentAccount>();

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
        const account = await this.currentAccount(userId);

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

        await this.persistRenewed(userId, account);
        return account.accessToken;
    }

    /**
     * La cuenta con la que se trabaja. Si una renovación anterior no pudo
     * guardarse, vale la que está en memoria (la de la base tiene un token de
     * renovación que Mercado Pago ya invalidó) y antes se intenta guardarla.
     */
    private async currentAccount(userId: string): Promise<SellerPaymentAccount> {
        const pending = this.unsaved.get(userId);
        if (!pending) {
            return requireAccount(await this.accounts.findByUserId(userId));
        }

        let stored: SellerPaymentAccount | null;
        try {
            stored = await this.accounts.findByUserId(userId);
        } catch {
            // La base sigue sin responder: se sigue con la cuenta renovada.
            return pending;
        }

        // Si el vendedor desvinculó o vinculó otra cuenta mientras tanto, lo
        // pendiente quedó viejo: guardarlo resucitaría una cuenta que ya no es.
        if (!stored || !stored.id.equals(pending.id)) {
            this.unsaved.delete(userId);
            return requireAccount(stored);
        }

        try {
            await this.accounts.save(pending);
            this.unsaved.delete(userId);
        } catch {
            // Se vuelve a intentar en el próximo pedido.
        }
        return pending;
    }

    /**
     * Guarda la cuenta renovada. Mercado Pago rota el token de renovación en
     * cada uso: si lo nuevo no queda guardado, el de la base ya no sirve. Se
     * reintenta una vez y, si la base sigue fallando, la cuenta renovada se
     * conserva en memoria y se devuelve igual el token vigente: un problema
     * momentáneo de la base no tiene que cortar el cobro. Nunca se registran
     * los tokens ni el error original.
     */
    private async persistRenewed(userId: string, account: SellerPaymentAccount): Promise<void> {
        for (let intento = 0; intento < 2; intento++) {
            try {
                await this.accounts.save(account);
                this.unsaved.delete(userId);
                return;
            } catch {
                // Se reintenta una vez; después se conserva en memoria.
            }
        }
        this.unsaved.set(userId, account);
    }
}

function requireAccount(account: SellerPaymentAccount | null): SellerPaymentAccount {
    if (!account) {
        throw new NotFoundError('El vendedor no vinculó su cuenta de Mercado Pago.');
    }
    return account;
}
