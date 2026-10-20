import { FastifyInstance, FastifyReply } from 'fastify';
import type {
    AuthorizationUrlDto,
    ConnectYouTubeChannelRequest,
    CreatedYouTubeListingDto,
    CreateListingFromYouTubeRequest,
    YouTubeAuthorizationRequest,
    YouTubeConnectionDto,
} from '@marketplace/api-contract';
import type { YouTubeConnectionSummary } from '@marketplace/domain/src/use-cases/youtube-connection/ConnectYouTubeChannelUseCase';
import { ASSET_NICHES } from '@marketplace/shared-types';
import { Container } from '../container';
import { authenticate, actorOf } from '../plugins/authenticate';

/**
 * La conexión del vendedor con un canal de YouTube.
 *
 * Estas rutas nunca devuelven ni registran tokens ni códigos: los cuerpos de
 * los pedidos no se loguean. El `state` lo genera la capa web y lo ata a la
 * cookie del navegador (como en Mercado Pago); acá solo se arma la dirección y
 * se canjea el código.
 */

/** Mismo estilo que las demás integraciones: 503, no 500, mientras no esté configurado. */
function notConfigured(reply: FastifyReply) {
    return reply.code(503).send({
        code: 'INTERNAL',
        message: 'La conexión con YouTube todavía no está configurada.',
    } as never);
}

function toDto(summary: YouTubeConnectionSummary): YouTubeConnectionDto {
    return {
        connectionId: summary.connectionId,
        channelId: summary.channelId,
        channelTitle: summary.channelTitle,
        ...(summary.thumbnailUrl ? { thumbnailUrl: summary.thumbnailUrl } : {}),
        subscribers: summary.subscribers,
        views12Months: summary.views12Months,
        revenue12MonthsCents: summary.revenue12MonthsCents,
        monthlyRevenueCents: summary.monthlyRevenueCents,
        isMonetized: summary.isMonetized,
        ...(summary.topCountry ? { topCountry: summary.topCountry } : {}),
        periodStart: summary.periodStart.toISOString(),
        periodEnd: summary.periodEnd.toISOString(),
        readAt: summary.readAt.toISOString(),
    };
}

export function registerYouTubeConnectionRoutes(app: FastifyInstance, c: Container): void {
    app.post<{ Body: YouTubeAuthorizationRequest; Reply: AuthorizationUrlDto }>(
        '/me/youtube/authorization',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['state'],
                    additionalProperties: false,
                    properties: {
                        state: { type: 'string', minLength: 1, maxLength: 512 },
                    },
                },
            },
        },
        async (request, reply) => {
            if (!c.youtubeConnectionOAuth) return notConfigured(reply);

            return reply.send({ url: c.youtubeConnectionOAuth.authorizationUrl({ state: request.body.state }) });
        },
    );

    app.post<{ Body: ConnectYouTubeChannelRequest; Reply: YouTubeConnectionDto }>(
        '/me/youtube/connect',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['code'],
                    additionalProperties: false,
                    properties: {
                        code: { type: 'string', minLength: 1, maxLength: 2048 },
                    },
                },
            },
        },
        async (request, reply) => {
            if (!c.connectYouTubeChannel) return notConfigured(reply);

            const summary = await c.connectYouTubeChannel.execute(request.body, actorOf(request));
            return reply.send(toDto(summary));
        },
    );

    app.get<{ Reply: YouTubeConnectionDto[] }>(
        '/me/youtube/connections',
        { preHandler: [authenticate] },
        async (request, reply) => {
            if (!c.listYouTubeConnections) return notConfigured(reply);

            const summaries = await c.listYouTubeConnections.execute(actorOf(request));
            return reply.send(summaries.map(toDto));
        },
    );

    app.post<{
        Params: { channelId: string };
        Body: CreateListingFromYouTubeRequest;
        Reply: CreatedYouTubeListingDto;
    }>(
        '/me/youtube/connections/:channelId/listing',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['niche', 'hasNoFaceContent', 'askingPrice'],
                    additionalProperties: false,
                    properties: {
                        // El rubro es uno del catálogo compartido, no texto libre.
                        niche: { type: 'string', enum: [...ASSET_NICHES] },
                        hasNoFaceContent: { type: 'boolean' },
                        askingPrice: {
                            type: 'object',
                            required: ['cents', 'currency'],
                            additionalProperties: false,
                            properties: {
                                cents: { type: 'integer', minimum: 1 },
                                currency: { type: 'string', enum: ['ARS', 'USD'] },
                            },
                        },
                    },
                },
            },
        },
        async (request, reply) => {
            if (!c.createListingFromYouTubeConnection) return notConfigured(reply);

            const { niche, hasNoFaceContent, askingPrice } = request.body;
            const created = await c.createListingFromYouTubeConnection.execute(
                {
                    channelId: request.params.channelId,
                    niche,
                    hasNoFaceContent,
                    askingPriceCents: askingPrice.cents,
                    currency: askingPrice.currency,
                },
                actorOf(request),
            );

            return reply.code(201).send(created);
        },
    );
}
