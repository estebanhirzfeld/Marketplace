import { Entity } from './Entity';
import { UniqueEntityID } from '../value-objects/UniqueEntityID';
import { Email } from '../value-objects/Email';
import { UserRole } from '@marketplace/shared-types';

export interface UserProps {
    email: Email;
    fullName: string;
    phone?: string;
    country?: string;
    dni?: string;
    role: UserRole;
    isKycVerified: boolean;
}

export class User extends Entity<UserProps> {
    private constructor(props: UserProps, id?: UniqueEntityID, createdAt?: Date) {
        super(props, id, createdAt);
    }

    /** Crea un usuario NUEVO — no verificado por default */
    public static create(props: Omit<UserProps, 'isKycVerified'>): User {
        return new User({
            ...props,
            isKycVerified: false,
        });
    }

    /** Rehidrata un usuario existente desde la DB */
    public static reconstitute(props: UserProps, id: UniqueEntityID, createdAt: Date): User {
        return new User(props, id, createdAt);
    }

    public get email(): Email {
        return this.props.email;
    }

    public get role(): UserRole {
        return this.props.role;
    }

    public get isKycVerified(): boolean {
        return this.props.isKycVerified;
    }
    // NOTE: Ya que estamos en DDD, esto se puede hacer con una api o de forma manual
    public verifyKyc(): void {
        if (!this.props.dni || !this.props.fullName) {
            throw new Error("No se puede verificar el KYC sin DNI y Nombre Completo.");
        }
        this.props.isKycVerified = true;
    }
}
