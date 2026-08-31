import { Entity } from './Entity';
import { UniqueEntityID } from '../value-objects/UniqueEntityID';

/**
 * Qué pasó. El texto que ve la persona no vive acá.
 *
 * La entidad guarda el tipo y los datos mínimos para armar el enlace; redactar
 * el mensaje es responsabilidad de la vista. Así se puede cambiar la redacción
 * —o traducirla— sin migrar la base, y el dominio no termina escribiendo copy.
 */
export type NotificationType =
    | 'oferta_recibida'
    | 'contraoferta_recibida'
    | 'oferta_aceptada'
    | 'oferta_cancelada'
    | 'listing_aprobado'
    | 'listing_rechazado'
    | 'contrato_firmado'
    | 'activo_en_custodia'
    | 'pago_confirmado'
    | 'operacion_completada'
    | 'denuncia_recibida'
    /*
     * Los que le tocan a la plataforma. Antes no existía ninguno: la campana
     * de un administrador estaba siempre vacía, incluso cuando una operación
     * llevaba días detenida esperando un movimiento suyo.
     */
    | 'revision_pendiente'
    | 'acceso_pendiente'
    | 'custodia_pendiente'
    | 'liquidacion_pendiente';

export interface NotificationProps {
    /** A quién se le avisa. */
    userId: UniqueEntityID;
    type: NotificationType;
    /** Operación o listing al que apunta el aviso. */
    operationId?: UniqueEntityID;
    listingId?: UniqueEntityID;
    /** Monto relevante en centavos, cuando el aviso habla de plata. */
    amountCents?: number;
    currency?: string;
    readAt?: Date;
}

export class Notification extends Entity<NotificationProps> {
    private constructor(props: NotificationProps, id?: UniqueEntityID, createdAt?: Date) {
        super(props, id, createdAt);
    }

    public static create(props: Omit<NotificationProps, 'readAt'>): Notification {
        return new Notification(props);
    }

    public static reconstitute(
        props: NotificationProps,
        id: UniqueEntityID,
        createdAt: Date,
    ): Notification {
        return new Notification(props, id, createdAt);
    }

    public get type(): NotificationType {
        return this.props.type;
    }

    public get userId(): UniqueEntityID {
        return this.props.userId;
    }

    public get isRead(): boolean {
        return this.props.readAt !== undefined;
    }

    /** Marcar dos veces no es un error: es la misma intención repetida. */
    public markAsRead(): void {
        if (this.props.readAt) return;
        this.props.readAt = new Date();
    }
}
