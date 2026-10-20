import { Entity } from './Entity';
import { UniqueEntityID } from '../value-objects/UniqueEntityID';
import { ValidationError } from '../errors/DomainError';

export interface SellerPaymentAccountProps {
    userId: UniqueEntityID;
    /** Identificador del vendedor en Mercado Pago. */
    mpUserId: string;
    /**
     * Los tokens viajan en texto plano dentro del dominio. El cifrado en reposo
     * es asunto de la persistencia (`ISecretCipher` en el repositorio): acá no
     * hay nada que cifrar ni descifrar.
     */
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    scope: string;
    linkedAt: Date;
}

/**
 * La cuenta de Mercado Pago que un vendedor vinculó para cobrar.
 *
 * Es una por usuario. Que exista —aunque el token esté vencido— significa que
 * el vendedor vinculó su cuenta; el vencimiento se resuelve renovando.
 */
export class SellerPaymentAccount extends Entity<SellerPaymentAccountProps> {
    private constructor(props: SellerPaymentAccountProps, id?: UniqueEntityID, createdAt?: Date) {
        super(props, id, createdAt);
    }

    /** Vincula una cuenta NUEVA: valida los datos que entrega Mercado Pago. */
    public static create(props: SellerPaymentAccountProps): SellerPaymentAccount {
        assertNotBlank(props.mpUserId, 'El identificador de Mercado Pago del vendedor es obligatorio.');
        assertNotBlank(props.accessToken, 'El token de acceso es obligatorio.');
        assertNotBlank(props.refreshToken, 'El token de renovación es obligatorio.');
        assertNotBlank(props.scope, 'Los permisos otorgados son obligatorios.');
        assertValidDate(props.expiresAt, 'La fecha de vencimiento del token no es válida.');

        return new SellerPaymentAccount({ ...props });
    }

    /** Rehidrata una cuenta existente desde la DB: no valida ni completa nada. */
    public static reconstitute(
        props: SellerPaymentAccountProps,
        id: UniqueEntityID,
        createdAt: Date,
    ): SellerPaymentAccount {
        return new SellerPaymentAccount(props, id, createdAt);
    }

    public get userId(): UniqueEntityID {
        return this.props.userId;
    }

    public get mpUserId(): string {
        return this.props.mpUserId;
    }

    public get accessToken(): string {
        return this.props.accessToken;
    }

    public get refreshToken(): string {
        return this.props.refreshToken;
    }

    public get expiresAt(): Date {
        return this.props.expiresAt;
    }

    public get scope(): string {
        return this.props.scope;
    }

    public get linkedAt(): Date {
        return this.props.linkedAt;
    }

    /** El token vence en `expiresAt`: desde ese instante ya no sirve. */
    public isExpired(now: Date): boolean {
        return now.getTime() >= this.props.expiresAt.getTime();
    }

    /**
     * Reemplaza los tokens tras un refresco. Mercado Pago rota el token de
     * renovación en cada uso, así que se guardan los dos juntos. Si algún dato
     * es inválido no se toca nada.
     */
    public renew(data: { accessToken: string; refreshToken: string; expiresAt: Date; now: Date }): void {
        assertNotBlank(data.accessToken, 'El token de acceso es obligatorio.');
        assertNotBlank(data.refreshToken, 'El token de renovación es obligatorio.');
        assertValidDate(data.expiresAt, 'La fecha de vencimiento del token no es válida.');
        if (data.expiresAt.getTime() <= data.now.getTime()) {
            throw new ValidationError('El token renovado ya está vencido.');
        }

        this.props.accessToken = data.accessToken;
        this.props.refreshToken = data.refreshToken;
        this.props.expiresAt = data.expiresAt;
    }
}

function assertNotBlank(value: string, message: string): void {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new ValidationError(message);
    }
}

function assertValidDate(value: Date, message: string): void {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        throw new ValidationError(message);
    }
}
