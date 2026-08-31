import { IOperationRepository, IUserRepository } from '../../ports/Repositories';
import { IPaymentGateway } from '../../ports/IPaymentGateway';
import { Actor } from '../../ports/Actor';
import { Checkout } from '../../ports/IPaymentGateway';
import { NegotiationNotifier } from '../../services/NegotiationNotifier';
import { PlatformNotifier } from '../../services/PlatformNotifier';
import { ForbiddenError, InvalidStateError, NotFoundError } from '../../errors/DomainError';

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

        return this.gateway.createCheckout({
            // La operación es la referencia: es lo que permite reconocer el
            // pago cuando la pasarela avisa.
            externalReference: operation.id.toString(),
            description: `Compra del activo de la operación ${operation.id.toString()}`,
            amountCents: buyerPays.getCents(),
            currency: buyerPays.getCurrency(),
            payerEmail: buyer.email.getValue(),
        });
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
    ) {}

    async execute(externalPaymentId: string): Promise<void> {
        const pago = await this.gateway.fetchPayment(externalPaymentId);
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
        await this.avisosDePlataforma?.payoutNeeded(operation);
    }
}
