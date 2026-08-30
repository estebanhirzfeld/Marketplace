import { FastifyInstance } from 'fastify';
import { Container } from '../container';
import { authenticate, authenticateOptional, actorOf } from '../plugins/authenticate';
import { SCOPE_ADSENSE, SCOPE_YOUTUBE } from '../adapters/GoogleOAuthClient';
import type {
    ContractDto,
    CreateListingRequest,
    CreateOfferRequest,
    CreatedListingDto,
    CreatedOperationDto,
    ListingDetailDto,
    ListingFiltersQuery,
    AuthorizationUrlDto,
    ChannelMetricsReportDto,
    OwnershipVerificationDto,
    ListingSummaryDto,
    OfferSummaryDto,
    RejectListingRequest,
} from '@marketplace/api-contract';

interface IdParams { id: string }

export function registerListingRoutes(app: FastifyInstance, c: Container): void {
    app.get<{ Querystring: ListingFiltersQuery; Reply: ListingSummaryDto[] }>(
        '/listings',
        {
            schema: {
                querystring: {
                    type: 'object',
                    properties: {
                        assetType: { type: 'string', enum: ['youtube', 'web'] },
                        currency: { type: 'string', enum: ['ARS', 'USD'] },
                        // `coerceTypes` de Fastify convierte el string del query
                        // a número; sin el schema llegarían como texto.
                        minPrice: { type: 'integer', minimum: 0 },
                        maxPrice: { type: 'integer', minimum: 0 },
                        minSubscribers: { type: 'integer', minimum: 0 },
                        onlyMonetized: { type: 'boolean' },
                        minDomainAuthority: { type: 'integer', minimum: 0, maximum: 100 },
                        sort: { type: 'string', enum: ['price', 'created', 'published', 'estimated'] },
                        direction: { type: 'string', enum: ['asc', 'desc'] },
                    },
                },
            },
        },
        async (request, reply) => {
        // Pasa por el use case, no por el repositorio: es lo que garantiza que
        // un listing blind no publique sus campos confidenciales acá.
        const vistas = await c.listadoPublico.execute(request.query);

        return reply.send(
            vistas.map((v): ListingSummaryDto => ({
                id: v.id,
                status: v.status as ListingSummaryDto['status'],
                assetType: v.assetType,
                askingPrice: v.askingPrice,
                estimatedPrice: v.estimatedPrice,
                assetData: v.assetData,
                hiddenFields: v.hiddenFields,
                transferable: v.transferable,
                transferableFrom: v.transferableFrom?.toISOString(),
                createdAt: v.createdAt.toISOString(),
                publishedAt: v.publishedAt?.toISOString(),
            })),
        );
    },
    );

    // Autenticación opcional: cuánto se ve depende de si hay NDA firmado.
    app.get<{ Params: IdParams; Reply: ListingDetailDto }>(
        '/listings/:id',
        { preHandler: [authenticateOptional] },
        async (request, reply) => {
            const view = await c.getListingDetails.execute(request.params.id, request.actor);

            // createdAt viaja como ISO string: JSON no tiene tipo fecha, y el
            // cliente móvil no debe adivinar el formato.
            const dto: ListingDetailDto = {
                ...view,
                ownership: view.ownership && {
                    verifiedAt: view.ownership.verifiedAt.toISOString(),
                    source: view.ownership.source,
                    monthlyRevenueCents: view.ownership.monthlyRevenueCents,
                },
                transferableFrom: view.transferableFrom?.toISOString(),
                createdAt: view.createdAt.toISOString(),
            };
            return reply.send(dto);
        },
    );

    /**
     * Contrasta lo declarado contra la API de YouTube. Solo el vendedor del
     * activo o un admin: la dirección del canal es un dato reservado y el
     * título que devuelve revelaría la identidad de un listing blind.
     */
    app.post<{ Params: IdParams; Reply: ChannelMetricsReportDto }>(
        '/listings/:id/verificar-metricas',
        { preHandler: [authenticate] },
        async (request, reply) => {
            if (!c.verifyChannelMetrics) {
                return reply.code(503).send({
                    code: 'INTERNAL',
                    message: 'La verificación con YouTube todavía no está configurada.',
                } as never);
            }

            const reporte = await c.verifyChannelMetrics.execute(
                request.params.id,
                actorOf(request),
            );

            return reply.send({ ...reporte, checkedAt: reporte.checkedAt.toISOString() });
        },
    );

    /**
     * Paso uno del consentimiento: la dirección a la que mandar al vendedor.
     *
     * `state` lleva el listing y la fuente para poder retomar al volver. No
     * lleva nada secreto: viaja por la barra de direcciones del navegador.
     */
    app.get<{ Params: { id: string; fuente: string }; Reply: AuthorizationUrlDto }>(
        '/listings/:id/autorizacion/:fuente',
        { preHandler: [authenticate] },
        async (request, reply) => {
            if (!c.googleOAuth) {
                return reply.code(503).send({
                    code: 'INTERNAL',
                    message: 'La verificación con Google todavía no está configurada.',
                } as never);
            }

            const { id, fuente } = request.params;
            const scope = fuente === 'adsense' ? SCOPE_ADSENSE : SCOPE_YOUTUBE;

            return reply.send({
                url: c.googleOAuth.authorizationUrl(scope, `${fuente}:${id}`),
            });
        },
    );

    /**
     * Paso dos: con el código que trajo el navegador, se le pregunta a Google
     * qué controla esa cuenta y se compara contra lo publicado. El código se
     * canjea, se usa una vez y se descarta: no se guarda ningún token.
     */
    app.post<{ Params: { id: string; fuente: string }; Body: { code: string } }>(
        '/listings/:id/verificar/:fuente',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['code'],
                    properties: { code: { type: 'string', minLength: 1 } },
                },
            },
        },
        async (request, reply) => {
            const { id, fuente } = request.params;
            const uso = fuente === 'adsense' ? c.verifyWebsiteRevenue : c.verifyChannelOwnership;

            if (!uso) {
                return reply.code(503).send({
                    code: 'INTERNAL',
                    message: 'La verificación con Google todavía no está configurada.',
                } as never);
            }

            const constancia = await uso.execute(id, request.body.code, actorOf(request));

            const dto: OwnershipVerificationDto = {
                verifiedAt: constancia.verifiedAt.toISOString(),
                source: constancia.source,
                monthlyRevenueCents: constancia.monthlyRevenueCents,
            };
            return reply.send(dto);
        },
    );

    app.post<{ Body: CreateListingRequest; Reply: CreatedListingDto }>(
        '/listings',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['assetType', 'assetData', 'askingPrice'],
                    properties: {
                        assetType: { type: 'string' },
                        // Sin schema: la forma de assetData depende del tipo de
                        // activo y esa validación vive en el factory del dominio,
                        // que es quien sabe qué campos requiere cada strategy.
                        assetData: { type: 'object' },
                        askingPrice: {
                            type: 'object',
                            required: ['cents', 'currency'],
                            properties: {
                                cents: { type: 'integer' },
                                currency: { type: 'string' },
                            },
                        },
                    },
                },
            },
        },
        async (request, reply) => {
            const listing = await c.createListing.execute(request.body, actorOf(request));

            const dto: CreatedListingDto = {
                id: listing.id.toString(),
                status: listing.status,
                askingPrice: {
                    cents: listing.askingPrice.getCents(),
                    currency: listing.askingPrice.getCurrency(),
                },
                estimatedPrice: {
                    cents: listing.estimatedPrice.getCents(),
                    currency: listing.estimatedPrice.getCurrency(),
                },
            };
            return reply.code(201).send(dto);
        },
    );

    app.post<{ Params: IdParams }>(
        '/listings/:id/submit',
        { preHandler: [authenticate] },
        async (request, reply) => {
            await c.submitListing.execute(request.params.id, actorOf(request));
            return reply.code(204).send();
        },
    );

    app.post<{ Params: IdParams }>(
        '/listings/:id/approve',
        { preHandler: [authenticate] },
        async (request, reply) => {
            await c.approveListing.execute(request.params.id, actorOf(request));
            return reply.code(204).send();
        },
    );

    app.post<{ Params: IdParams; Body: RejectListingRequest }>(
        '/listings/:id/reject',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['reason'],
                    properties: { reason: { type: 'string' } },
                },
            },
        },
        async (request, reply) => {
            await c.rejectListing.execute(request.params.id, request.body.reason, actorOf(request));
            return reply.code(204).send();
        },
    );

    app.get<{ Params: IdParams; Reply: OfferSummaryDto[] }>(
        '/listings/:id/offers',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const offers = await c.getSellerOffers.execute(request.params.id, actorOf(request));
            return reply.send(
                offers.map((op): OfferSummaryDto => ({
                    id: op.id.toString(),
                    status: op.status,
                    currentOfferPrice: {
                        cents: op.currentOfferPrice.getCents(),
                        currency: op.currentOfferPrice.getCurrency(),
                    },
                    pendingResponseFrom: op.pendingResponseFrom,
                })),
            );
        },
    );

    app.post<{ Params: IdParams; Reply: ContractDto }>(
        '/listings/:id/nda',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const nda = await c.signNda.execute(
                request.params.id,
                request.ip,
                actorOf(request),
            );
            const dto: ContractDto = {
                id: nda.id.toString(),
                type: nda.type,
                isFullySigned: nda.isFullySigned(),
            };
            return reply.code(201).send(dto);
        },
    );

    app.post<{ Params: IdParams; Body: CreateOfferRequest; Reply: CreatedOperationDto }>(
        '/listings/:id/offers',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['offerPrice'],
                    properties: {
                        offerPrice: {
                            type: 'object',
                            required: ['cents', 'currency'],
                            properties: {
                                cents: { type: 'integer' },
                                currency: { type: 'string' },
                            },
                        },
                    },
                },
            },
        },
        async (request, reply) => {
            const operation = await c.createOffer.execute(
                { listingId: request.params.id, offerPrice: request.body.offerPrice },
                actorOf(request),
            );
            const dto: CreatedOperationDto = {
                id: operation.id.toString(),
                status: operation.status,
            };
            return reply.code(201).send(dto);
        },
    );
}
