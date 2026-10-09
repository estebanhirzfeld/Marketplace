import { UserRole } from '@marketplace/shared-types';
import { IYouTubeConnectionRepository } from '../../ports/Repositories';
import { IYouTubeConnectionOAuthClient, YouTubeConnectionTokens } from '../../ports/IYouTubeConnectionOAuthClient';
import { IYouTubeAnalyticsReader } from '../../ports/IYouTubeAnalyticsReader';
import { ISecretCipher } from '../../ports/ISecretCipher';
import { Actor } from '../../ports/Actor';
import { YouTubeConnection } from '../../entities/YouTubeConnection';
import { YouTubeChannelAnalytics } from '../../value-objects/YouTubeChannelAnalytics';
import { MissingYouTubeScopesError, missingYouTubeScopes } from '../../value-objects/YouTubeScopes';
import { UniqueEntityID } from '../../value-objects/UniqueEntityID';
import { ForbiddenError, ValidationError } from '../../errors/DomainError';

export interface ConnectYouTubeChannelInput {
    /** El código que Google entregó al volver; es de un solo uso. */
    code: string;
}

/** Lo que se le muestra al vendedor del canal conectado. Nunca incluye tokens. */
export interface YouTubeConnectionSummary {
    connectionId: string;
    channelId: string;
    channelTitle: string;
    thumbnailUrl?: string;
    subscribers: number;
    views12Months: number;
    revenue12MonthsCents: number;
    monthlyRevenueCents: number;
    isMonetized: boolean;
    topCountry?: string;
    periodStart: Date;
    periodEnd: Date;
    readAt: Date;
}

export function summarizeConnection(connection: YouTubeConnection): YouTubeConnectionSummary {
    const reading = connection.lastSnapshot;
    return {
        connectionId: connection.id.toString(),
        channelId: connection.channelId,
        channelTitle: connection.channelTitle,
        thumbnailUrl: reading.thumbnailUrl,
        subscribers: reading.subscribers,
        views12Months: reading.views12Months,
        revenue12MonthsCents: reading.revenue12MonthsCents,
        monthlyRevenueCents: reading.monthlyRevenueCents(),
        isMonetized: reading.isMonetized(),
        topCountry: reading.topCountry,
        periodStart: reading.periodStart,
        periodEnd: reading.periodEnd,
        readAt: reading.readAt,
    };
}

/**
 * El vendedor conecta su canal de YouTube autorizando a la plataforma.
 *
 * El orden importa: primero se verifican los permisos y recién después se lee
 * el canal, y nada se guarda hasta tener todo. Si falta un permiso, la cuenta
 * no tiene canal o Google falla, no queda ninguna conexión a medias.
 *
 * Una conexión por vendedor y canal: conectar de nuevo el mismo canal la
 * actualiza (y la reactiva) en vez de duplicarla.
 */
export class ConnectYouTubeChannelUseCase {
    constructor(
        private readonly connections: IYouTubeConnectionRepository,
        private readonly oauth: IYouTubeConnectionOAuthClient,
        private readonly reader: IYouTubeAnalyticsReader,
        private readonly cipher: ISecretCipher,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async execute(input: ConnectYouTubeChannelInput, actor: Actor): Promise<YouTubeConnectionSummary> {
        if (actor.role === UserRole.ADMIN) {
            throw new ForbiddenError('Un administrador no puede conectar un canal de YouTube.');
        }

        let tokens: YouTubeConnectionTokens;
        try {
            tokens = await this.oauth.exchangeCode({ code: input.code });
        } catch {
            // El error original puede traer el código o el secreto de la app.
            throw new ValidationError(
                'No pudimos conectar tu canal: el permiso venció o ya se usó. Probá de nuevo.',
            );
        }

        const missing = missingYouTubeScopes(tokens.grantedScopes);
        if (missing.length > 0) {
            throw new MissingYouTubeScopesError(missing);
        }

        if (!tokens.refreshToken) {
            throw new ValidationError(
                'Google no nos dio un acceso que podamos renovar. Volvé a conectar y aceptá todos los permisos.',
            );
        }

        let reading: YouTubeChannelAnalytics | null;
        try {
            reading = await this.reader.read(tokens.accessToken);
        } catch {
            throw new ValidationError(
                'No pudimos leer tu canal. No se guardó nada; probá de nuevo en unos minutos.',
            );
        }
        if (!reading) {
            throw new ValidationError(
                'Esa cuenta de Google no tiene un canal. Si tu canal está en una cuenta de marca, ' +
                'elegila en la pantalla de Google.',
            );
        }

        const encryptedRefreshToken = this.cipher.encrypt(tokens.refreshToken);

        const existing = await this.connections.findBySellerAndChannel(actor.id, reading.channelId);
        let connection: YouTubeConnection;
        if (existing) {
            existing.reconnect({
                grantedScopes: tokens.grantedScopes,
                encryptedRefreshToken,
                snapshot: reading,
            });
            connection = existing;
        } else {
            connection = YouTubeConnection.create({
                sellerId: new UniqueEntityID(actor.id),
                channelId: reading.channelId,
                channelTitle: reading.title,
                grantedScopes: tokens.grantedScopes,
                encryptedRefreshToken,
                connectedAt: this.now(),
                lastSnapshot: reading,
            });
        }

        await this.connections.save(connection);
        return summarizeConnection(connection);
    }
}
