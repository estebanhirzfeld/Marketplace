import { Entity } from './Entity';
import { UniqueEntityID } from '../value-objects/UniqueEntityID';
import { Email } from '../value-objects/Email';
import { UserRole } from '@marketplace/shared-types';
import { ForbiddenError, InvalidStateError, ValidationError } from '../errors/DomainError';

export interface UserProps {
    email: Email;
    fullName: string;
    phone?: string;
    country?: string;
    dni?: string;
    role: UserRole;
    isKycVerified: boolean;
    /** Hash producido por IPasswordHasher. El texto plano nunca se guarda. */
    passwordHash: string;
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

    /**
     * El hash solo sale de la entidad para que el hasher lo compare. No hay
     * getter del texto plano porque la entidad nunca lo tuvo.
     */
    public get passwordHash(): string {
        return this.props.passwordHash;
    }

    /**
     * Los actos con valor legal — publicar un listing, firmar un NDA o un
     * contrato — exigen identidad verificada. Navegar, ofertar y negociar no.
     */
    public assertCanSign(): void {
        if (!this.props.isKycVerified) {
            throw new ForbiddenError(
                'Debés verificar tu identidad (KYC) para firmar.'
            );
        }
    }
    /**
     * Presenta la documentación y queda verificado.
     *
     * Al registrarse solo se pide email, nombre y contraseña, así que sin este
     * método `verifyKyc()` fallaba siempre por falta de DNI y el usuario nuevo
     * quedaba bloqueado para publicar y para firmar, sin salida.
     *
     * La verificación es manual por ahora: se comprueba la forma del documento,
     * no su existencia real. Integrar un proveedor (Renaper, Didit) es trabajo
     * de infraestructura y va detrás de un puerto, no acá.
     */
    public verificarIdentidad(datos: { dni: string; phone?: string; country?: string }): void {
        if (this.props.isKycVerified) {
            throw new InvalidStateError('Tu identidad ya está verificada.');
        }

        // Se acepta con puntos o guiones y se guarda normalizado.
        const dni = datos.dni.replace(/[.\s-]/g, '');

        if (dni === '') {
            throw new ValidationError('Ingresá tu número de documento.');
        }
        if (!/^\d{7,11}$/.test(dni)) {
            throw new ValidationError('El documento debe tener entre 7 y 11 dígitos, sin letras.');
        }

        this.props.dni = dni;
        if (datos.phone) this.props.phone = datos.phone;
        if (datos.country) this.props.country = datos.country;

        this.verifyKyc();
    }

    // NOTE: Ya que estamos en DDD, esto se puede hacer con una api o de forma manual
    public verifyKyc(): void {
        if (!this.props.dni || !this.props.fullName) {
            throw new ValidationError("No se puede verificar el KYC sin DNI y Nombre Completo.");
        }
        this.props.isKycVerified = true;
    }
}
