import { Entity } from './Entity';
import { UniqueEntityID } from '../value-objects/UniqueEntityID';

export interface NDAProps {
    listingId: UniqueEntityID;
    buyerId: UniqueEntityID;
    isSigned: boolean;
    signedAt?: Date;
    signatureIp?: string;
}

export class NDA extends Entity<NDAProps> {
    private constructor(props: NDAProps, id?: UniqueEntityID, createdAt?: Date) {
        super(props, id, createdAt);
    }

    /** Crea un NDA NUEVO — sin firmar */
    public static create(
        props: Omit<NDAProps, 'isSigned' | 'signedAt'>
    ): NDA {
        return new NDA({
            ...props,
            isSigned: false,
        });
    }

    /** Rehidrata un NDA existente desde la DB */
    public static reconstitute(props: NDAProps, id: UniqueEntityID, createdAt: Date): NDA {
        return new NDA(props, id, createdAt);
    }

    public sign(ipAddress: string): void {
        if (this.props.isSigned) {
            throw new Error("El NDA ya fue firmado.");
        }

        this.props.isSigned = true;
        this.props.signedAt = new Date();
        this.props.signatureIp = ipAddress;
    }

    public get isSigned(): boolean {
        return this.props.isSigned;
    }
}
