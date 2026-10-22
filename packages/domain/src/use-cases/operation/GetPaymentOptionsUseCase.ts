import {
    IOperationRepository,
    ISellerBankAccountRepository,
    ISellerPaymentAccountRepository,
} from '../../ports/Repositories';
import { Money } from '../../value-objects/Money';
import { IExchangeRateProvider } from '../../ports/IExchangeRateProvider';
import { Actor } from '../../ports/Actor';
import { Operation } from '../../entities/Operation';
import { ForbiddenError, InvalidStateError, NotFoundError } from '../../errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

function moneyOf(m: Money | undefined): { cents: number; currency: string } {
    if (!m) throw new Error('La operación con el activo en custodia siempre tiene el reparto calculado.');
    return { cents: m.getCents(), currency: m.getCurrency() };
}

/** Moneda en la que Mercado Pago cobra sin convertir por su cuenta. */
const CHECKOUT_CURRENCY = 'ARS';

/** Por qué Mercado Pago no se puede usar en una operación. */
export type MercadoPagoUnavailableReason =
    | 'not_configured'
    | 'seller_not_linked'
    | 'rate_unavailable';

export interface PaymentOptions {
    /** Moneda de la operación. */
    currency: string;
    /** Lo que paga el comprador, comisión incluida, en la moneda de la operación. */
    amount: { cents: number; currency: string };
    mercadopago: {
        available: boolean;
        reason?: MercadoPagoUnavailableReason;
        /** Mercado Pago siempre cobra en pesos. */
        chargedIn: 'ARS';
        /** `true` cuando la operación no es en pesos y hay que pesificarla. */
        converted: boolean;
    };
    transfer: {
        available: boolean;
        /** Por qué no se puede: falta la cuenta del vendedor en la moneda de la operación. */
        reason?: TransferUnavailableReason;
        /** Texto cargado por la plataforma para la moneda de la operación. */
        instructions?: string;
        /** Lo que el comprador indica al transferir: el id de la operación. */
        reference: string;
        /**
         * Las dos transferencias, cada una con su monto: lo del vendedor a su
         * cuenta y la comisión a la plataforma. Solo para el comprador y la
         * plataforma: el vendedor no ve datos bancarios de nadie.
         */
        destinations?: TransferDestination[];
    };
}

export type TransferUnavailableReason = 'seller_bank_missing';

export type TransferDestination =
    | {
          recipient: 'seller';
          amount: { cents: number; currency: string };
          bankAccount: { cbu?: string; alias?: string; holder: string };
      }
    | { recipient: 'platform'; amount: { cents: number; currency: string }; instructions: string };

export interface PaymentOptionsDeps {
    /** Existe la pasarela (hay credenciales de Mercado Pago). */
    mercadoPagoEnabled: boolean;
    /** El cobro con split está encendido: el vendedor tiene que haber vinculado su cuenta. */
    splitEnabled: boolean;
    /** Texto de transferencia por moneda. Sin texto para una moneda, no se ofrece. */
    transferInstructions: { ARS?: string; USD?: string };
    paymentAccounts?: ISellerPaymentAccountRepository;
    rates?: IExchangeRateProvider;
    /** Las cuentas bancarias de los vendedores: sin la de la moneda de la operación, no hay transferencia. */
    bankAccounts?: ISellerBankAccountRepository;
}

/**
 * Cómo puede pagar el comprador una operación con el activo en custodia.
 *
 * Solo informa: nunca falla por una opción no disponible, la reporta. Las
 * reglas replican lo que `CreateCheckoutUseCase` exigiría después, para no
 * ofrecer un botón que va a terminar en error.
 *
 * Las instrucciones de transferencia las ven el comprador y los admins; la
 * autorización vive acá porque son datos de la plataforma. El vendedor solo se
 * entera de si la opción existe.
 */
export class GetPaymentOptionsUseCase {
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly deps: PaymentOptionsDeps,
    ) {}

    async execute(operationId: string, actor: Actor): Promise<PaymentOptions> {
        const operation = await this.operationRepo.findById(operationId);
        if (!operation) {
            throw new NotFoundError('Operación no encontrada');
        }

        // Un admin puede no ser parte; entra por rol. Para el resto, lanza
        // ForbiddenError si es un tercero.
        const isAdmin = actor.role === UserRole.ADMIN;
        const party = isAdmin ? undefined : operation.partyFor(actor.id);

        if (operation.status !== 'asset_in_custody') {
            throw new InvalidStateError('Todavía no corresponde pagar: el activo no está en custodia.');
        }

        const buyerPays = operation.buyerPays;
        if (!buyerPays) {
            throw new InvalidStateError('La operación todavía no tiene un precio acordado.');
        }
        const currency = buyerPays.getCurrency();
        const converted = currency !== CHECKOUT_CURRENCY;

        const reason = await this.mercadoPagoReason(operation, converted);
        const instructions = this.instructionsFor(currency);
        const sellerBank =
            instructions !== undefined && (currency === 'ARS' || currency === 'USD')
                ? await this.deps.bankAccounts?.findByUserAndCurrency(operation.sellerId.toString(), currency)
                : null;
        const transferAvailable = instructions !== undefined && !!sellerBank;
        // El vendedor ni paga ni confirma: se entera de que la transferencia
        // existe, pero los datos bancarios de la plataforma son del comprador y
        // del admin.
        const canSeeInstructions = isAdmin || party === 'buyer';

        return {
            currency,
            amount: { cents: buyerPays.getCents(), currency },
            mercadopago: {
                available: reason === undefined,
                ...(reason ? { reason } : {}),
                chargedIn: CHECKOUT_CURRENCY,
                converted,
            },
            transfer: {
                available: transferAvailable,
                ...(instructions !== undefined && !sellerBank ? { reason: 'seller_bank_missing' as const } : {}),
                ...(instructions !== undefined && canSeeInstructions ? { instructions } : {}),
                reference: operation.id.toString(),
                ...(transferAvailable && sellerBank && canSeeInstructions
                    ? {
                          destinations: [
                              {
                                  recipient: 'seller' as const,
                                  amount: moneyOf(operation.sellerReceives),
                                  bankAccount: {
                                      ...(sellerBank.destination.cbu ? { cbu: sellerBank.destination.cbu } : {}),
                                      ...(sellerBank.destination.alias ? { alias: sellerBank.destination.alias } : {}),
                                      holder: sellerBank.destination.holder,
                                  },
                              },
                              {
                                  recipient: 'platform' as const,
                                  amount: moneyOf(operation.platformEarns),
                                  instructions: instructions!,
                              },
                          ],
                      }
                    : {}),
            },
        };
    }

    /** `undefined` si Mercado Pago se puede usar. */
    private async mercadoPagoReason(
        operation: Operation,
        converted: boolean,
    ): Promise<MercadoPagoUnavailableReason | undefined> {
        if (!this.deps.mercadoPagoEnabled) return 'not_configured';

        if (this.deps.splitEnabled) {
            // Sin descifrar tokens: acá solo importa si hay cuenta vinculada.
            const linked = await this.deps.paymentAccounts?.existsByUserId(
                operation.sellerId.toString(),
            );
            if (!linked) return 'seller_not_linked';
        }

        if (converted) {
            const rate = await this.deps.rates?.getUsdArsRate();
            if (!rate) return 'rate_unavailable';
        }

        return undefined;
    }

    private instructionsFor(currency: string): string | undefined {
        const text = (this.deps.transferInstructions as Record<string, string | undefined>)[currency];
        const trimmed = text?.trim();
        return trimmed ? trimmed : undefined;
    }
}
