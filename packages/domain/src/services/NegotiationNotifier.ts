import { INotifier } from '../ports/INotifier';
import { Notification } from '../entities/Notification';
import { Operation, NegotiatingParty } from '../entities/Operation';
import { Listing } from '../entities/Listing';
import { UniqueEntityID } from '../value-objects/UniqueEntityID';

/**
 * Quién se entera de qué.
 *
 * Vive fuera de los use cases para que no repitan la misma decisión nueve
 * veces, y fuera de las entidades porque a quién avisar no es una invariante
 * de la operación: es una política, y las políticas cambian.
 *
 * Ningún método propaga errores. Que un aviso no salga es molesto; que se
 * caiga una venta porque el correo no anduvo es inaceptable.
 */
export class NegotiationNotifier {
    constructor(private readonly notifier: INotifier) {}

    async offerReceived(operation: Operation): Promise<void> {
        const { props } = operation.toSnapshot();

        await this.enviar([
            Notification.create({
                userId: props.sellerId,
                type: 'oferta_recibida',
                operationId: operation.id,
                listingId: props.listingId,
                amountCents: operation.currentOfferPrice.getCents(),
                currency: operation.currentOfferPrice.getCurrency(),
            }),
        ]);
    }

    /** Le avisa a quien quedó con el turno, que es quien no propuso. */
    async counterOfferMade(operation: Operation): Promise<void> {
        const { props } = operation.toSnapshot();
        const destinatario =
            operation.pendingResponseFrom === 'buyer' ? props.buyerId : props.sellerId;

        await this.enviar([
            Notification.create({
                userId: destinatario,
                type: 'contraoferta_recibida',
                operationId: operation.id,
                listingId: props.listingId,
                amountCents: operation.currentOfferPrice.getCents(),
                currency: operation.currentOfferPrice.getCurrency(),
            }),
        ]);
    }

    async offerAccepted(operation: Operation, aceptoLa: NegotiatingParty): Promise<void> {
        const { props } = operation.toSnapshot();
        const otraParte = aceptoLa === 'buyer' ? props.sellerId : props.buyerId;
        const price = operation.finalPrice ?? operation.currentOfferPrice;

        await this.enviar([
            Notification.create({
                userId: otraParte,
                type: 'oferta_aceptada',
                operationId: operation.id,
                listingId: props.listingId,
                amountCents: price.getCents(),
                currency: price.getCurrency(),
            }),
        ]);
    }

    /**
     * La cascada híbrida cancela las ofertas rivales. Sin este aviso esos
     * compradores quedan esperando una respuesta que nunca va a llegar.
     */
    async offersCancelledByCascade(canceladas: Operation[]): Promise<void> {
        if (canceladas.length === 0) return;

        await this.enviar(
            canceladas.map((op) => {
                const { props } = op.toSnapshot();
                return Notification.create({
                    userId: props.buyerId,
                    type: 'oferta_cancelada',
                    operationId: op.id,
                    listingId: props.listingId,
                });
            }),
        );
    }

    async listingReviewed(listing: Listing, aprobado: boolean): Promise<void> {
        const { props } = listing.toSnapshot();

        await this.enviar([
            Notification.create({
                userId: props.sellerId,
                type: aprobado ? 'listing_aprobado' : 'listing_rechazado',
                listingId: listing.id,
            }),
        ]);
    }

    /** Las dos partes se enteran de que el contrato quedó cerrado. */
    async contractSigned(operation: Operation): Promise<void> {
        await this.toBothParties(operation, 'contrato_firmado');
    }

    /** El activo llegó a custodia: al comprador le toca pagar. */
    async assetInCustody(operation: Operation): Promise<void> {
        const { props } = operation.toSnapshot();
        const aPagar = operation.buyerPays ?? operation.currentOfferPrice;

        await this.enviar([
            Notification.create({
                userId: props.buyerId,
                type: 'activo_en_custodia',
                operationId: operation.id,
                listingId: props.listingId,
                amountCents: aPagar.getCents(),
                currency: aPagar.getCurrency(),
            }),
        ]);
    }

    async paymentConfirmed(operation: Operation): Promise<void> {
        const { props } = operation.toSnapshot();
        const aCobrar = operation.sellerReceives ?? operation.currentOfferPrice;

        await this.enviar([
            Notification.create({
                userId: props.sellerId,
                type: 'pago_confirmado',
                operationId: operation.id,
                listingId: props.listingId,
                amountCents: aCobrar.getCents(),
                currency: aCobrar.getCurrency(),
            }),
        ]);
    }

    async operationCompleted(operation: Operation): Promise<void> {
        await this.toBothParties(operation, 'operacion_completada');
    }

    // ── Interno ──────────────────────────────────────────

    private async toBothParties(
        operation: Operation,
        type: Notification['type'],
    ): Promise<void> {
        const { props } = operation.toSnapshot();
        const paraCada = (userId: UniqueEntityID) =>
            Notification.create({
                userId,
                type,
                operationId: operation.id,
                listingId: props.listingId,
            });

        await this.enviar([paraCada(props.buyerId), paraCada(props.sellerId)]);
    }

    private async enviar(notifications: Notification[]): Promise<void> {
        try {
            await this.notifier.notify(notifications);
        } catch {
            // Deliberado: un aviso que no sale no puede tumbar la operación
            // que lo originó. El adaptador registra el fallo por su cuenta.
        }
    }
}
