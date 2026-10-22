import { Entity } from './Entity';
import { UniqueEntityID } from '../value-objects/UniqueEntityID';
import { BankDestination } from '../value-objects/BankDestination';

export interface SellerBankAccountProps {
    userId: UniqueEntityID;
    destination: BankDestination;
    declaredAt: Date;
}

/**
 * La cuenta bancaria donde un vendedor cobra lo suyo cuando el comprador paga
 * por transferencia. Una por moneda: el comprador transfiere en la moneda de
 * la operación. La plataforma nunca recibe esa plata.
 */
export class SellerBankAccount extends Entity<SellerBankAccountProps> {
    private constructor(props: SellerBankAccountProps, id?: UniqueEntityID, createdAt?: Date) {
        super(props, id, createdAt);
    }

    /** Una cuenta NUEVA, declarada ahora. */
    public static declare(props: Omit<SellerBankAccountProps, 'declaredAt'>, at: Date = new Date()): SellerBankAccount {
        return new SellerBankAccount({ ...props, declaredAt: at });
    }

    /** Rehidrata desde la DB: no valida ni completa nada. */
    public static reconstitute(props: SellerBankAccountProps, id: UniqueEntityID, createdAt: Date): SellerBankAccount {
        return new SellerBankAccount(props, id, createdAt);
    }

    public get userId(): UniqueEntityID {
        return this.props.userId;
    }

    public get destination(): BankDestination {
        return this.props.destination;
    }

    public get declaredAt(): Date {
        return this.props.declaredAt;
    }

    /** El vendedor la corrige: misma cuenta para la moneda, datos nuevos. */
    public replace(destination: BankDestination, at: Date = new Date()): void {
        this.props.destination = destination;
        this.props.declaredAt = at;
    }
}
