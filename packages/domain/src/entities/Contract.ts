import { Entity } from './Entity';
import { UniqueEntityID } from '../value-objects/UniqueEntityID';

export type ContractType = 'initial' | 'tripartite';

export interface ContractProps {
    operationId: UniqueEntityID;
    contractType: ContractType;
    signaturitId?: string;
    fileUrl?: string;
    signedBySeller: boolean;
    signedByBuyer: boolean;
    signedByPlatform: boolean;
    signedAt?: Date;
}

export class Contract extends Entity<ContractProps> {
    private constructor(props: ContractProps, id?: UniqueEntityID, createdAt?: Date) {
        super(props, id, createdAt);
    }

    /** Crea un contrato NUEVO — defaults seguros */
    public static create(
        props: Pick<ContractProps, 'operationId' | 'contractType'>
    ): Contract {
        return new Contract({
            ...props,
            signedBySeller: false,
            signedByBuyer: false,
            signedByPlatform: false,
        });
    }

    /** Rehidrata un contrato existente desde la DB — sin defaults, todo como vino */
    public static reconstitute(
        props: ContractProps,
        id: UniqueEntityID,
        createdAt: Date
    ): Contract {
        return new Contract(props, id, createdAt);
    }

    public isFullySigned(): boolean {
        if (this.props.contractType === 'tripartite') {
            return this.props.signedBySeller && this.props.signedByBuyer && this.props.signedByPlatform;
        }
        return this.props.signedBySeller && this.props.signedByPlatform;
    }

    public signProvider(role: 'seller' | 'buyer' | 'platform'): void {
        if (role === 'seller') this.props.signedBySeller = true;
        if (role === 'buyer') this.props.signedByBuyer = true;
        if (role === 'platform') this.props.signedByPlatform = true;

        if (this.isFullySigned() && !this.props.signedAt) {
            this.props.signedAt = new Date();
        }
    }
}
