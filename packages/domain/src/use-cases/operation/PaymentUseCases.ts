import {
    IOperationRepository,
    ISellerPaymentAccountRepository,
    IUserRepository,
} from '../../ports/Repositories';
import { CheckoutRequest, IPaymentGateway } from '../../ports/IPaymentGateway';
import { ISellerAccessTokenSource } from '../../ports/ISellerAccessTokenSource';
import { IExchangeRateProvider } from '../../ports/IExchangeRateProvider';
import { Operation } from '../../entities/Operation';
import { SettlementQuote } from '../../value-objects/SettlementQuote';
import { Actor } from '../../ports/Actor';
import { Checkout } from '../../ports/IPaymentGateway';
import { NegotiationNotifier } from '../../services/NegotiationNotifier';
import { PlatformNotifier } from '../../services/PlatformNotifier';
import {
    ForbiddenError,
    InvalidStateError,
    NotFoundError,
    SellerTokenUnavailableError,
    ValidationError,
} from '../../errors/DomainError';

/** Única moneda en la que la pasarela cobra sin convertir por su cuenta. */
const CHECKOUT_CURRENCY = 'ARS';

/**
 * Prepara el cobro al comprador.
 *
 * Solo tiene sentido con el activo ya en custodia: es la regla central del
 * escrow —el activo entra antes de que se cobre— y acá se hace cumplir antes
 * de generar el link, para no mandar a nadie a pagar algo que la entidad
 * después va a rechazar.
 */
export class CreateCheckoutUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly userRepo: IUserRepository,
        private readonly gateway: IPaymentGateway,
        private readonly rates?: IExchangeRateProvider,
        private readonly now: () => Date = () => new Date(),
        /**
         * Presente solo con el split de Mercado Pago encendido: el vendedor
         * cobra directo y la plataforma retiene su comisión. Ausente, se cobra
         * a la cuenta de la plataforma, como siempre.
         */
        private readonly sellerTokens?: ISellerAccessTokenSource,
    ) {}

    async execute(operationId: string, actor: Actor): Promise<Checkout> {
        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        if (operation.partyFor(actor.id) !== 'buyer') {
            throw new ForbiddenError('El pago lo hace el comprador.');
        }
        if (operation.status !== 'asset_in_custody') {
            throw new InvalidStateError(
                'Todavía no corresponde pagar: el activo tiene que estar en custodia de la plataforma.',
            );
        }

        const buyerPays = operation.buyerPays;
        if (!buyerPays) {
            throw new InvalidStateError('La operación todavía no tiene un precio acordado.');
        }

        const buyer = await this.userRepo.findById(actor.id);
        if (!buyer) {
            throw new NotFoundError('Usuario no encontrado');
        }

        // Mercado Pago cobra en pesos: ante una preferencia en otra moneda
        // convierte a su propio cambio y el pago llega por un monto que la
        // operación no puede reconocer. Por eso se pesifica acá, con una
        // cotización congelada, y se cobra por ese monto.
        //
        // Con split, el token del vendedor se resuelve ANTES de cotizar: si
        // Mercado Pago no está disponible para este vendedor no tiene sentido
        // guardar una cotización que no se va a usar.
        const sellerAccessToken = await this.resolveSellerToken(operation);

        let amountCents = buyerPays.getCents();
        let marketplaceFeeCents = operation.platformEarns?.getCents();
        let expiresAt: Date | undefined;
        if (buyerPays.getCurrency() !== CHECKOUT_CURRENCY) {
            const quote = await this.currentQuote(operation, buyerPays.getCurrency());
            amountCents = quote.buyerPaysCents;
            marketplaceFeeCents = quote.platformFeeCents;
            expiresAt = quote.expiresAt;
        }

        const request: CheckoutRequest = {
            // La operación es la referencia: es lo que permite reconocer el
            // pago cuando la pasarela avisa.
            externalReference: operation.id.toString(),
            description: `Compra del activo de la operación ${operation.id.toString()}`,
            amountCents,
            currency: CHECKOUT_CURRENCY,
            payerEmail: buyer.email.getValue(),
        };

        if (sellerAccessToken === undefined) {
            return this.gateway.createCheckout(request);
        }

        // La comisión viaja siempre en pesos, como el monto: Mercado Pago la
        // cobra en moneda local y la tiene que poder reconocer.
        if (
            marketplaceFeeCents === undefined ||
            marketplaceFeeCents <= 0 ||
            marketplaceFeeCents >= amountCents
        ) {
            throw new ValidationError(
                'La comisión de la plataforma tiene que ser positiva y menor al monto a cobrar.',
            );
        }

        return this.gateway.createCheckout({
            ...request,
            sellerAccessToken,
            marketplaceFeeCents,
            ...(expiresAt ? { expiresAt } : {}),
        });
    }

    /**
     * El token del vendedor para cobrar a su nombre, o `undefined` si el split
     * no está encendido. Los dos motivos por los que Mercado Pago no se puede
     * usar con este vendedor se traducen a un aviso claro que ofrece la
     * transferencia, sin llamar a la pasarela.
     */
    private async resolveSellerToken(operation: Operation): Promise<string | undefined> {
        if (!this.sellerTokens) return undefined;

        try {
            return await this.sellerTokens.execute(operation.sellerId.toString());
        } catch (error) {
            if (error instanceof NotFoundError) {
                throw new ValidationError(
                    'El vendedor todavía no habilitó Mercado Pago para cobrar. Podés pagar por transferencia bancaria.',
                );
            }
            if (error instanceof InvalidStateError) {
                throw new ValidationError(
                    'Mercado Pago no está disponible para esta operación por ahora. Podés pagar por transferencia bancaria.',
                );
            }
            throw error;
        }
    }

    /**
     * La cotización con la que se cobra: la vigente si la hay, o una nueva.
     * Reutilizarla mantiene estable el monto mientras el comprador sigue
     * intentando pagar; una nueva se guarda antes de generar el link, para que
     * el pago que llegue se compare contra lo que se pidió.
     */
    private async currentQuote(operation: Operation, currency: string): Promise<SettlementQuote> {
        const now = this.now();
        const existing = operation.settlementQuote;
        if (existing && !existing.isExpired(now)) return existing;

        const rate = await this.rates?.getUsdArsRate();
        if (!rate) {
            throw new ValidationError(
                `Este pago no se puede hacer por Mercado Pago ahora: la operación está en ${currency} y no hay una cotización a pesos disponible. Se puede pagar por transferencia bancaria.`,
            );
        }

        const { buyerPays, sellerReceives } = operation;
        if (!buyerPays || !sellerReceives) {
            throw new InvalidStateError('La operación todavía no tiene un precio acordado.');
        }

        const quote = SettlementQuote.create({
            buyerPays,
            sellerReceives,
            exchangeRate: rate,
            now,
        });
        operation.quoteSettlement(quote);
        await this.operationRepo.save(operation);
        return quote;
    }
}

/**
 * Confirma un pago a partir de un aviso de la pasarela.
 *
 * Del aviso se toma únicamente el identificador del pago. El estado, el monto
 * y la referencia se preguntan a la pasarela con nuestras credenciales, así
 * que un aviso falsificado no alcanza para dar por pagada una operación: en el
 * peor caso provoca una consulta que no encuentra nada.
 *
 * Es idempotente porque las pasarelas reintentan sus avisos: si la operación
 * ya está pagada, no hace nada y no falla.
 */
export class ConfirmPaymentFromGatewayUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly gateway: IPaymentGateway,
        private readonly avisos?: NegotiationNotifier,
        private readonly avisosDePlataforma?: PlatformNotifier,
        /** Las dos juntas habilitan el split: sin alguna, se consulta con el token de la plataforma. */
        private readonly sellerTokens?: ISellerAccessTokenSource,
        private readonly paymentAccounts?: ISellerPaymentAccountRepository,
    ) {}

    /**
     * `hint.collectorMpUserId` es el usuario de Mercado Pago que figura como
     * cobrador en el aviso. Es una PISTA, no una prueba: solo decide con qué
     * token se consulta el pago. Lo que lo da por válido es la consulta a la
     * pasarela y la conciliación contra la operación.
     */
    async execute(externalPaymentId: string, hint?: { collectorMpUserId?: string }): Promise<void> {
        const sellerToken = await this.resolveSplitToken(hint?.collectorMpUserId);

        const pago = sellerToken
            ? await this.gateway.fetchPayment(externalPaymentId, { accessToken: sellerToken })
            : await this.gateway.fetchPayment(externalPaymentId);
        if (!pago) return;

        // Pendiente o rechazado no es un error: es un pago que todavía no
        // habilita nada. La pasarela va a volver a avisar si cambia.
        if (pago.status !== 'approved') return;

        const operation = await this.operationRepo.findById(pago.externalReference);
        if (!operation) {
            throw new NotFoundError('El pago no corresponde a ninguna operación.');
        }

        // Reintento de un aviso ya procesado: no es un error.
        if (operation.status !== 'asset_in_custody') return;

        // La entidad valida que el monto y la moneda cierren.
        operation.confirmBuyerPayment({
            provider: 'mercadopago',
            externalId: pago.externalId,
            method: pago.method,
            amountCents: pago.amountCents,
            currency: pago.currency,
        });

        await this.operationRepo.save(operation);
        await this.avisos?.paymentConfirmed(operation);
        // Con split Mercado Pago ya le pagó al vendedor: no hay liquidación
        // que hacer a mano.
        if (!sellerToken) {
            await this.avisosDePlataforma?.payoutNeeded(operation);
        }
    }

    /**
     * El token del vendedor al que apunta la pista, o `undefined` para seguir
     * con el token de la plataforma: sin pista, sin las dependencias del split
     * o con un cobrador que no corresponde a ninguna cuenta vinculada.
     */
    private async resolveSplitToken(collectorMpUserId?: string): Promise<string | undefined> {
        if (!collectorMpUserId || !this.sellerTokens || !this.paymentAccounts) return undefined;

        const account = await this.paymentAccounts.findByMpUserId(collectorMpUserId);
        if (!account) return undefined;

        // Sin token no se puede ni consultar el pago: se avisa con un error
        // propio para que el transporte pida reintentar, en vez de dejar la
        // operación sin confirmar. Cualquier otro fallo se propaga igual.
        try {
            return await this.sellerTokens.execute(account.userId.toString());
        } catch (error) {
            if (error instanceof NotFoundError || error instanceof InvalidStateError) {
                throw new SellerTokenUnavailableError();
            }
            throw error;
        }
    }
}
