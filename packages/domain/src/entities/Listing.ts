import { Entity } from './Entity';
import { UniqueEntityID } from '../value-objects/UniqueEntityID';
import { Money } from '../value-objects/Money';
import { IAssetStrategy } from '../strategies/IAssetStrategy';

export type ListingStatus =
    | 'draft'
    | 'under_review'
    | 'published'
    | 'in_operation'
    | 'sold'
    | 'rejected';

export interface ListingProps {
    sellerId: UniqueEntityID;
    assetStrategy: IAssetStrategy;
    status: ListingStatus;
    askingPrice: Money;
    isBlind: boolean;
    publishedAt?: Date;
    rejectionReason?: string;
}

export class Listing extends Entity<ListingProps> {
    private constructor(props: ListingProps, id?: UniqueEntityID, createdAt?: Date) {
        super(props, id, createdAt);
    }

    /** Crea un listing NUEVO — arranca en draft */
    public static create(
        props: Omit<ListingProps, 'status' | 'publishedAt'>
    ): Listing {
        return new Listing({
            ...props,
            status: 'draft',
        });
    }

    /** Rehidrata un listing existente desde la DB */
    public static reconstitute(props: ListingProps, id: UniqueEntityID, createdAt: Date): Listing {
        return new Listing(props, id, createdAt);
    }

    public get sellerId(): UniqueEntityID {
        return this.props.sellerId;
    }

    public get status(): ListingStatus {
        return this.props.status;
    }

    public get estimatedPrice(): Money {
        return this.props.assetStrategy.calculateEstimatedPrice();
    }

    public get askingPrice(): Money {
        return this.props.askingPrice;
    }

    // State transitions would trigger through XState machine normally,
    // but domain logic guarantees rules before allowing transition.
    public submitForReview(): void {
        if (this.props.status !== 'draft' && this.props.status !== 'rejected') {
            throw new Error("Solo los listings en draft o rejected pueden ser enviados a revisión.");
        }
        this.props.status = 'under_review';
    }

    public approve(): void {
        if (this.props.status !== 'under_review') {
            throw new Error("El listing debe estar en revisión para ser aprobado.");
        }
        this.props.status = 'published';
        this.props.publishedAt = new Date();
    }

    public reject(reason: string): void {
        if (this.props.status !== 'under_review') {
            throw new Error("El listing debe estar en revisión para ser rechazado.");
        }
        if (!reason || reason.trim() === '') {
            throw new Error("Debe proveer un motivo de rechazo.");
        }
        this.props.status = 'rejected';
        this.props.rejectionReason = reason;
    }
}
