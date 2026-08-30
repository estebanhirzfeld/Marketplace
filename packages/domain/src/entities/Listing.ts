import { Entity } from './Entity';
import { UniqueEntityID } from '../value-objects/UniqueEntityID';
import { Money } from '../value-objects/Money';
import { IAssetStrategy } from '../strategies/IAssetStrategy';
import { ForbiddenError, InvalidStateError, ValidationError } from '../errors/DomainError';

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

    /**
     * Qué datos del activo se muestran, y cuáles quedan ocultos.
     *
     * La decisión vive acá y no en un use case porque es una regla del
     * negocio: un listing blind expone solo lo que su strategy declara
     * público. Antes estaba dentro de GetListingDetailsUseCase, así que la
     * ruta del listado la salteaba sin que nada lo advirtiera.
     *
     * `revelarConfidenciales` lo decide quien llama: el dueño siempre puede,
     * un comprador solo con el NDA firmado.
     */
    public datosDelActivo(revelarConfidenciales: boolean): {
        assetType: string;
        assetData: Record<string, unknown>;
        hiddenFields: string[];
    } {
        const { assetType, assetData } = this.props.assetStrategy.toJSON();

        if (!this.props.isBlind || revelarConfidenciales) {
            return { assetType, assetData, hiddenFields: [] };
        }

        const publicos = this.props.assetStrategy.getPublicFields();
        const filtrado: Record<string, unknown> = {};
        for (const campo of publicos) {
            if (campo in assetData) filtrado[campo] = assetData[campo];
        }

        return {
            assetType,
            assetData: filtrado,
            hiddenFields: this.props.assetStrategy.getConfidentialFields(),
        };
    }

    // ── Pertenencia ────────────────────────────────────────

    /** ¿Este actor es el vendedor de este listing? */
    public isOwnedBy(actorId: string): boolean {
        return this.props.sellerId.toString() === actorId;
    }

    public assertOwnedBy(actorId: string): void {
        if (!this.isOwnedBy(actorId)) {
            throw new ForbiddenError('No sos el vendedor de este listing.');
        }
    }

    // State transitions would trigger through XState machine normally,
    // but domain logic guarantees rules before allowing transition.
    public submitForReview(): void {
        if (this.props.status !== 'draft' && this.props.status !== 'rejected') {
            throw new InvalidStateError("Solo los listings en draft o rejected pueden ser enviados a revisión.");
        }
        this.props.status = 'under_review';
    }

    public approve(): void {
        if (this.props.status !== 'under_review') {
            throw new InvalidStateError("El listing debe estar en revisión para ser aprobado.");
        }
        this.props.status = 'published';
        this.props.publishedAt = new Date();
    }

    public reject(reason: string): void {
        if (this.props.status !== 'under_review') {
            throw new InvalidStateError("El listing debe estar en revisión para ser rechazado.");
        }
        if (!reason || reason.trim() === '') {
            throw new ValidationError("Debe proveer un motivo de rechazo.");
        }
        this.props.status = 'rejected';
        this.props.rejectionReason = reason;
    }

    public markInOperation(): void {
        if (this.props.status !== 'published') {
            throw new InvalidStateError("El listing debe estar publicado para entrar en operación.");
        }
        this.props.status = 'in_operation';
    }

    public markSold(): void {
        if (this.props.status !== 'in_operation') {
            throw new InvalidStateError("El listing debe estar en operación para marcarse como vendido.");
        }
        this.props.status = 'sold';
    }
}
