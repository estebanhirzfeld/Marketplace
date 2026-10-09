import { Entity } from './Entity';
import { UniqueEntityID } from '../value-objects/UniqueEntityID';
import { YouTubeChannelAnalytics } from '../value-objects/YouTubeChannelAnalytics';
import { missingYouTubeScopes } from '../value-objects/YouTubeScopes';
import { ValidationError } from '../errors/DomainError';

export type YouTubeConnectionStatus = 'active' | 'disconnected';

export interface YouTubeConnectionProps {
    sellerId: UniqueEntityID;
    channelId: string;
    channelTitle: string;
    grantedScopes: string[];
    /**
     * El token de actualización YA cifrado. El dominio nunca lo ve en claro ni
     * lo descifra: eso es del adaptador que lee Analytics.
     */
    encryptedRefreshToken: string;
    status: YouTubeConnectionStatus;
    connectedAt: Date;
    lastReadAt: Date;
    lastSnapshot: YouTubeChannelAnalytics;
}

export type CreateYouTubeConnectionProps = Omit<YouTubeConnectionProps, 'status' | 'lastReadAt'>;

/**
 * La conexión de un vendedor con un canal de YouTube.
 *
 * Es una por vendedor y canal. Guarda lo necesario para volver a leer el canal
 * sin pedir otra autorización: los permisos otorgados y el token de
 * actualización cifrado.
 */
export class YouTubeConnection extends Entity<YouTubeConnectionProps> {
    private constructor(props: YouTubeConnectionProps, id?: UniqueEntityID, createdAt?: Date) {
        super(props, id, createdAt);
    }

    /** Conexión NUEVA: nace activa y su última lectura es la del snapshot. */
    public static create(props: CreateYouTubeConnectionProps): YouTubeConnection {
        assertNotBlank(props.channelId, 'El identificador del canal es obligatorio.');
        assertNotBlank(props.channelTitle, 'El título del canal es obligatorio.');
        assertToken(props.encryptedRefreshToken);
        assertAllScopes(props.grantedScopes);

        return new YouTubeConnection({
            ...props,
            grantedScopes: [...props.grantedScopes],
            status: 'active',
            lastReadAt: props.lastSnapshot.readAt,
        });
    }

    /** Rehidrata desde la DB: no valida ni completa nada. */
    public static reconstitute(props: YouTubeConnectionProps, id: UniqueEntityID, createdAt: Date): YouTubeConnection {
        return new YouTubeConnection(props, id, createdAt);
    }

    public get sellerId(): UniqueEntityID { return this.props.sellerId; }
    public get channelId(): string { return this.props.channelId; }
    public get channelTitle(): string { return this.props.channelTitle; }
    public get grantedScopes(): string[] { return [...this.props.grantedScopes]; }
    public get encryptedRefreshToken(): string { return this.props.encryptedRefreshToken; }
    public get status(): YouTubeConnectionStatus { return this.props.status; }
    public get connectedAt(): Date { return this.props.connectedAt; }
    public get lastReadAt(): Date { return this.props.lastReadAt; }
    public get lastSnapshot(): YouTubeChannelAnalytics { return this.props.lastSnapshot; }

    public isActive(): boolean {
        return this.props.status === 'active';
    }

    public isOwnedBy(sellerId: string): boolean {
        return this.props.sellerId.toString() === sellerId;
    }

    /** Deja de usarse: el vendedor la quitó o el token dejó de servir. */
    public disconnect(): void {
        this.props.status = 'disconnected';
    }

    /**
     * Vuelve a conectar el mismo canal: reemplaza permisos, token y lectura, y
     * la reactiva. Si algún dato es inválido no se toca nada.
     */
    public reconnect(data: { grantedScopes: string[]; encryptedRefreshToken: string; snapshot: YouTubeChannelAnalytics }): void {
        assertToken(data.encryptedRefreshToken);
        assertAllScopes(data.grantedScopes);
        if (data.snapshot.channelId !== this.props.channelId) {
            throw new ValidationError('La lectura corresponde a otro canal.');
        }

        this.props.grantedScopes = [...data.grantedScopes];
        this.props.encryptedRefreshToken = data.encryptedRefreshToken;
        this.props.channelTitle = data.snapshot.title;
        this.props.lastSnapshot = data.snapshot;
        this.props.lastReadAt = data.snapshot.readAt;
        this.props.status = 'active';
    }
}

function assertNotBlank(value: string, message: string): void {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new ValidationError(message);
    }
}

function assertToken(value: string): void {
    assertNotBlank(value, 'El token de actualización cifrado es obligatorio.');
}

function assertAllScopes(granted: string[]): void {
    if (missingYouTubeScopes(granted).length > 0) {
        throw new ValidationError('La conexión necesita los tres permisos de YouTube.');
    }
}
