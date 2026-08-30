import { Entity } from './Entity';
import { UniqueEntityID } from '../value-objects/UniqueEntityID';
import { Money } from '../value-objects/Money';
import { ForbiddenError, InvalidStateError, ValidationError } from '../errors/DomainError';

export type OperationStatus =
    | 'offer_sent'
    | 'negotiating'
    | 'contract_pending'
    | 'contract_signed'
    | 'transfer_in_progress'
    | 'asset_in_custody'
    | 'payment_received'
    | 'completed'
    | 'cancelled';

export type NegotiatingParty = 'buyer' | 'seller';

export interface Negotiation {
    amount: number;            // centavos — sin Money para serialización limpia
    currency: string;
    proposedBy: NegotiatingParty;
    proposedAt: Date;
}

const COMMISSION_RATE = 5; // 5% a cada parte


/**
 * Constancia de qué verificó la plataforma al tomar el activo en custodia.
 *
 * Antes de esto, confirmar custodia era un botón sin registro: nadie podía
 * responder qué se había comprobado ni quién lo hizo. Es el paso en el que la
 * plataforma asume el riesgo, así que es el que más necesita constancia.
 */
export interface CustodyVerification {
    verifiedBy: UniqueEntityID;
    verifiedAt: Date;
    /**
     * Si la plataforma quedó como propietaria principal del activo.
     *
     * YouTube exige haber sido propietario 7 días antes de poder volverse
     * principal. Hasta que eso ocurre, el vendedor conserva la facultad de
     * expulsar a la plataforma y la custodia no es efectiva.
     */
    isPrimaryOwner: boolean;
    /** Emails de recuperación, segundo factor y demás accesos bajo control. */
    accessSecured: boolean;
    /** Foto de las métricas al momento de la recepción. */
    metrics: Record<string, number>;
    notes?: string;
}

/** Lo que aporta quien verifica; la fecha la pone la entidad. */
export type CustodyVerificationInput = Omit<CustodyVerification, 'verifiedAt'>;

/** De dónde entró la plata. */
export type PaymentProvider = 'mercadopago' | 'transferencia';

/**
 * Constancia del pago del comprador.
 *
 * Confirmar el pago era un botón sin registro de por dónde había entrado la
 * plata. Guardar el identificador externo permite reconciliar contra la
 * pasarela más adelante, y es la evidencia que se presenta ante un contracargo
 * junto con la constancia de custodia: prueba que el activo ya estaba en manos
 * de la plataforma cuando se cobró.
 */
export interface PaymentRecord {
    provider: PaymentProvider;
    /** El id del pago en la pasarela. Ausente en una transferencia manual. */
    externalId?: string;
    method: string;
    amountCents: number;
    currency: string;
    confirmedAt: Date;
}

export type PaymentInput = Omit<PaymentRecord, 'confirmedAt'>;

export interface OperationProps {
    listingId: UniqueEntityID;
    buyerId: UniqueEntityID;
    sellerId: UniqueEntityID;
    status: OperationStatus;
    offerPrice: Money;
    negotiations: Negotiation[];
    finalPrice?: Money;
    buyerCommission?: Money;
    sellerCommission?: Money;
    buyerPays?: Money;
    sellerReceives?: Money;
    platformEarns?: Money;
    custodyVerification?: CustodyVerification;
    payment?: PaymentRecord;
    completedAt?: Date;
}

export class Operation extends Entity<OperationProps> {
    private constructor(props: OperationProps, id?: UniqueEntityID, createdAt?: Date) {
        super(props, id, createdAt);

        if (props.finalPrice) {
            this.calculateCommissionAndPayouts();
        }
    }

    // ── Factories ──────────────────────────────────────────

    /** Crea una operación NUEVA — arranca en offer_sent con la oferta del buyer */
    public static create(
        props: Pick<OperationProps, 'listingId' | 'buyerId' | 'sellerId' | 'offerPrice'>
    ): Operation {
        return new Operation({
            ...props,
            status: 'offer_sent',
            negotiations: [{
                amount: props.offerPrice.getCents(),
                currency: props.offerPrice.getCurrency(),
                proposedBy: 'buyer',
                proposedAt: new Date(),
            }],
        });
    }

    /** Rehidrata una operación existente desde la DB */
    public static reconstitute(props: OperationProps, id: UniqueEntityID, createdAt: Date): Operation {
        return new Operation(props, id, createdAt);
    }

    // ── Comisiones ──────────────────────────────────────────

    /**
     * Modelo de comisión split 5%/5%:
     * - Buyer paga: finalPrice + 5% comisión
     * - Seller recibe: finalPrice - 5% comisión
     * - Plataforma gana: 5% buyer + 5% seller = 10% total sobre finalPrice
     */
    private calculateCommissionAndPayouts(): void {
        if (!this.props.finalPrice) return;

        this.props.buyerCommission = this.props.finalPrice.getPercentage(COMMISSION_RATE);
        this.props.sellerCommission = this.props.finalPrice.getPercentage(COMMISSION_RATE);
        this.props.buyerPays = this.props.finalPrice.add(this.props.buyerCommission);
        this.props.sellerReceives = this.props.finalPrice.subtract(this.props.sellerCommission);
        this.props.platformEarns = this.props.buyerCommission.add(this.props.sellerCommission);
    }


    // ── Getters ──────────────────────────────────────────────

    public get listingId(): UniqueEntityID {
        return this.props.listingId;
    }

    public get status(): OperationStatus {
        return this.props.status;
    }

    public get finalPrice(): Money | undefined {
        return this.props.finalPrice;
    }

    public get buyerCommission(): Money | undefined {
        return this.props.buyerCommission;
    }

    public get sellerCommission(): Money | undefined {
        return this.props.sellerCommission;
    }

    public get buyerPays(): Money | undefined {
        return this.props.buyerPays;
    }

    public get sellerReceives(): Money | undefined {
        return this.props.sellerReceives;
    }


    public get platformEarns(): Money | undefined {
        return this.props.platformEarns;
    }

    /** Historial completo de ofertas y contraofertas */
    public get negotiations(): ReadonlyArray<Readonly<Negotiation>> {
        return this.props.negotiations;
    }

    /** Precio que está actualmente sobre la mesa */
    public get currentOfferPrice(): Money {
        const last = this.props.negotiations[this.props.negotiations.length - 1];
        return Money.fromCents(last.amount, last.currency);
    }

    /** A quién le toca responder */
    public get pendingResponseFrom(): NegotiatingParty {
        const last = this.props.negotiations[this.props.negotiations.length - 1];
        return last.proposedBy === 'buyer' ? 'seller' : 'buyer';
    }

    // ── Pertenencia ─────────────────────────────────────────

    /**
     * Qué posición ocupa este actor en ESTA operación.
     *
     * Ser buyer o seller no es un atributo de la persona sino de su relación
     * con una operación concreta: con varios buyers compitiendo por un mismo
     * listing, cada uno es 'buyer' en su operación y un tercero en las demás.
     * Un chequeo de rol global no podría distinguirlas.
     */
    public partyFor(actorId: string): NegotiatingParty {
        if (this.props.buyerId.toString() === actorId) return 'buyer';
        if (this.props.sellerId.toString() === actorId) return 'seller';

        throw new ForbiddenError('No sos parte de esta operación.');
    }

    /** Para los pasos que solo le corresponden a quien entrega el activo. */
    public assertIsSeller(actorId: string): void {
        if (this.partyFor(actorId) !== 'seller') {
            throw new ForbiddenError('Solo el seller de la operación puede hacer esto.');
        }
    }

    // ── Negociación ─────────────────────────────────────────

    /**
     * Contraoferta. Solo puede contra-ofertar quien NO hizo la última oferta.
     * Buyer ofrece → Seller contra-oferta (o acepta, o cancela).
     * Seller contra-oferta → Buyer contra-oferta (o acepta, o cancela).
     */
    public counterOffer(price: Money, by: NegotiatingParty): void {
        this.assertCanNegotiate(by);
        this.assertConverge(price, by);

        this.props.negotiations.push({
            amount: price.getCents(),
            currency: price.getCurrency(),
            proposedBy: by,
            proposedAt: new Date(),
        });

        this.props.status = 'negotiating';
    }

    /**
     * Acepta el precio que está actualmente sobre la mesa.
     * Solo puede aceptar quien NO hizo la última oferta.
     */
    public acceptCurrentOffer(by: NegotiatingParty): void {
        this.assertCanNegotiate(by);

        this.props.finalPrice = this.currentOfferPrice;
        this.calculateCommissionAndPayouts();
        this.props.status = 'contract_pending';
    }

    private assertCanNegotiate(by: NegotiatingParty): void {
        if (this.props.status !== 'offer_sent' && this.props.status !== 'negotiating') {
            throw new InvalidStateError(
                `Solo se puede negociar en estado offer_sent o negotiating, estado actual: ${this.props.status}`
            );
        }

        if (this.pendingResponseFrom !== by) {
            throw new InvalidStateError(
                `No es el turno de ${by}. Le toca responder a ${this.pendingResponseFrom}.`
            );
        }
    }

    /**
     * La negociación tiene que cerrarse: el comprador nunca baja y el vendedor
     * nunca sube respecto de su propia propuesta anterior.
     *
     * El motivo de fondo es la terminación. `TIMEOUT` figura en la máquina de
     * estados pero nadie lo implementa, así que sin esta regla dos partes
     * pueden oscilar indefinidamente y dejar el listing bloqueado.
     *
     * Comparar contra la última propuesta *de la misma parte* y no contra la
     * que está sobre la mesa es lo que hace la regla simétrica: el vendedor
     * baja hacia el comprador y el comprador sube hacia el vendedor, así que
     * una sola comparación contra el precio actual no sirve para los dos.
     *
     * Si el comprador necesita bajar —por ejemplo, firmó el NDA y los datos
     * reales lo decepcionaron— cancela y vuelve a ofertar. Es explícito y deja
     * el historial anterior intacto.
     */
    private assertConverge(price: Money, by: NegotiatingParty): void {
        const propiaAnterior = [...this.props.negotiations]
            .reverse()
            .find((n) => n.proposedBy === by);

        // La primera propuesta de cada parte no tiene con qué compararse.
        if (!propiaAnterior) return;

        if (propiaAnterior.currency !== price.getCurrency()) {
            throw new ValidationError(
                `La contraoferta debe estar en ${propiaAnterior.currency}, la moneda de la negociación.`
            );
        }

        const anterior = Money.fromCents(propiaAnterior.amount, propiaAnterior.currency);

        if (by === 'buyer' && !price.isGreaterThan(anterior)) {
            throw new InvalidStateError(
                'Una contraoferta del comprador tiene que superar su propuesta anterior.'
            );
        }

        if (by === 'seller' && !anterior.isGreaterThan(price)) {
            throw new InvalidStateError(
                'Una contraoferta del vendedor tiene que ser menor que su propuesta anterior.'
            );
        }
    }

    // ── Transiciones de estado ───────────────────────────────

    public signContract(): void {
        if (this.props.status !== 'contract_pending') {
            throw new InvalidStateError('Operación no está esperando contrato');
        }
        this.props.status = 'contract_signed';
    }

    public initiateTransfer(): void {
        if (this.props.status !== 'contract_signed') {
            throw new InvalidStateError('El contrato debe estar firmado para iniciar la transferencia');
        }
        this.props.status = 'transfer_in_progress';
    }

    /**
     * La plataforma declara haber recibido el activo.
     *
     * Exige la constancia de qué se verificó. Sin propiedad principal ni
     * accesos asegurados no se puede declarar la custodia: pedirle el pago al
     * comprador mientras el vendedor todavía puede revertir la transferencia
     * lo expondría al riesgo exacto que el escrow existe para eliminar.
     */
    public confirmAssetCustody(data: CustodyVerificationInput): void {
        if (this.props.status !== 'transfer_in_progress') {
            throw new InvalidStateError('No hay transferencia en curso');
        }

        if (!data.verifiedBy) {
            throw new ValidationError('Falta registrar quién verificó la custodia.');
        }

        if (!data.isPrimaryOwner) {
            throw new InvalidStateError(
                'La plataforma todavía no es propietaria principal del activo: la custodia no es efectiva y el vendedor aún puede revertirla.'
            );
        }

        if (!data.accessSecured) {
            throw new InvalidStateError(
                'Faltan asegurar los accesos del activo (correos de recuperación y segundo factor).'
            );
        }

        this.props.custodyVerification = { ...data, verifiedAt: new Date() };
        this.props.status = 'asset_in_custody';
    }

    public get payment(): PaymentRecord | undefined {
        return this.props.payment;
    }

    public get custodyVerification(): CustodyVerification | undefined {
        return this.props.custodyVerification;
    }

    /**
     * Confirma el pago del comprador con la constancia de por dónde entró.
     *
     * El monto tiene que coincidir exactamente con lo que el comprador debía.
     * Un pago por menos no cierra la obligación y aceptarlo dejaría a la
     * plataforma entregando un activo que no terminó de cobrar; uno por más es
     * señal de que ese pago no corresponde a esta operación.
     */
    public confirmBuyerPayment(datos: PaymentInput): void {
        if (this.props.status !== 'asset_in_custody') {
            throw new InvalidStateError('El activo debe estar en custodia de la plataforma antes del pago');
        }
        if (!this.props.buyerPays) {
            throw new InvalidStateError('La operación todavía no tiene un precio acordado.');
        }
        if (datos.provider !== 'transferencia' && !datos.externalId) {
            throw new ValidationError('Falta el identificador del pago en la pasarela.');
        }
        if (datos.currency !== this.props.buyerPays.getCurrency()) {
            throw new ValidationError(
                `El pago llegó en ${datos.currency} y la operación es en ${this.props.buyerPays.getCurrency()}.`,
            );
        }
        if (datos.amountCents !== this.props.buyerPays.getCents()) {
            throw new ValidationError(
                'El monto pagado no coincide con el total de la operación.',
            );
        }

        this.props.payment = { ...datos, confirmedAt: new Date() };
        this.props.status = 'payment_received';
    }

    public complete(): void {
        if (this.props.status !== 'payment_received') {
            throw new InvalidStateError('El pago debe estar confirmado para completar la operación');
        }
        this.props.status = 'completed';
        this.props.completedAt = new Date();
    }


    public cancel(): void {
        const cancellableStates: OperationStatus[] = [
            'offer_sent', 'negotiating', 'contract_pending'
        ];
        if (!cancellableStates.includes(this.props.status)) {
            throw new InvalidStateError(`No se puede cancelar una operación en estado ${this.props.status}`);
        }
        this.props.status = 'cancelled';
    }
}
