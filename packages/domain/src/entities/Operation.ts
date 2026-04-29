import { Entity } from './Entity';
import { UniqueEntityID } from '../value-objects/UniqueEntityID';
import { Money } from '../value-objects/Money';

export type OperationStatus =
    | 'offer_sent'
    | 'negotiating'
    | 'contract_pending'
    | 'contract_signed'
    | 'transfer_in_progress'
    | 'asset_in_custody'
    | 'payment_pending'
    | 'payment_received'
    | 'completed'
    | 'cancelled';

const COMMISSION_RATE = 5; // 5% a cada parte

export interface OperationProps {
    listingId: UniqueEntityID;
    buyerId: UniqueEntityID;
    sellerId: UniqueEntityID;
    status: OperationStatus;
    offerPrice: Money;
    finalPrice?: Money;
    buyerCommission?: Money;
    sellerCommission?: Money;
    buyerPays?: Money;
    sellerReceives?: Money;
    platformEarns?: Money;
    completedAt?: Date;
}

export class Operation extends Entity<OperationProps> {
    private constructor(props: OperationProps, id?: UniqueEntityID, createdAt?: Date) {
        super(props, id, createdAt);

        if (props.finalPrice) {
            this.calculateCommissionAndPayouts();
        }
    }

    /** Crea una operación NUEVA — arranca en offer_sent */
    public static create(
        props: Pick<OperationProps, 'listingId' | 'buyerId' | 'sellerId' | 'offerPrice'>
    ): Operation {
        return new Operation({
            ...props,
            status: 'offer_sent',
        });
    }

    /** Rehidrata una operación existente desde la DB */
    public static reconstitute(props: OperationProps, id: UniqueEntityID, createdAt: Date): Operation {
        return new Operation(props, id, createdAt);
    }

    /**
     * Modelo de comisión split 5%/5%:
     * - Buyer paga: finalPrice + 5% comisión
     * - Seller recibe: finalPrice - 5% comisión
     * - Plataforma gana: 5% buyer + 5% seller = 10% total sobre finalPrice
     *
     * Flujo: Buyer → Plataforma (buyerPays) → Plataforma retiene (platformEarns) → Seller (sellerReceives)
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

    // ── Transiciones de estado ───────────────────────────────

    public acceptOffer(finalPrice: Money): void {
        if (this.props.status !== 'offer_sent' && this.props.status !== 'negotiating') {
            throw new Error('Solo se pueden aceptar ofertas en estado offer_sent o negotiating');
        }

        this.props.finalPrice = finalPrice;
        this.calculateCommissionAndPayouts();
        this.props.status = 'contract_pending';
    }

    public signContract(): void {
        if (this.props.status !== 'contract_pending') {
            throw new Error('Operación no está esperando contrato');
        }
        this.props.status = 'contract_signed';
    }

    public initiateTransfer(): void {
        if (this.props.status !== 'contract_signed') {
            throw new Error('El contrato debe estar firmado para iniciar la transferencia');
        }
        this.props.status = 'transfer_in_progress';
    }

    public confirmAssetCustody(): void {
        if (this.props.status !== 'transfer_in_progress') {
            throw new Error('No hay transferencia en curso');
        }
        this.props.status = 'asset_in_custody';
    }

    public confirmBuyerPayment(): void {
        if (this.props.status !== 'asset_in_custody') {
            throw new Error('El activo debe estar en custodia de la plataforma antes del pago');
        }
        this.props.status = 'payment_received';
    }

    public complete(): void {
        if (this.props.status !== 'payment_received') {
            throw new Error('El pago debe estar confirmado para completar la operación');
        }
        this.props.status = 'completed';
        this.props.completedAt = new Date();
    }

    public cancel(): void {
        const cancellableStates: OperationStatus[] = [
            'offer_sent', 'negotiating', 'contract_pending'
        ];
        if (!cancellableStates.includes(this.props.status)) {
            throw new Error(`No se puede cancelar una operación en estado ${this.props.status}`);
        }
        this.props.status = 'cancelled';
    }
}
