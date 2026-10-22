import { FastifyInstance } from 'fastify';
import { Container } from '../container';
import { authenticate, authenticateOptional, actorOf } from '../plugins/authenticate';
import { identifyDnsProvider } from '../adapters/identifyDnsProvider';
import { SCOPE_ADSENSE, SCOPE_YOUTUBE } from '../adapters/GoogleOAuthClient';
import { ASSET_NICHES, AssetType } from '@marketplace/shared-types';
import { describeAssetTypes } from '@marketplace/domain/src/strategies/AssetStrategyFactory';
import type {
    AssetTypeDescriptorDto,
    ContractDto,
    CreateListingRequest,
    CreateOfferRequest,
    CreatedListingDto,
    CreatedOperationDto,
    EditListingRequest,
    EstimateListingRequest,
    EstimatedPriceDto,
    ListingDetailDto,
    ListingFiltersQuery,
    AuthorizationUrlDto,
    DomainOwnershipChallengeDto,
    DomainOwnershipVerificationDto,
    ChannelMetricsReportDto,
    OwnershipVerificationDto,
    ListingSummaryDto,
    OfferSummaryDto,
    RejectListingRequest,
} from '@marketplace/api-contract';

interface IdParams { id: string }

/** Las fuentes que pasan por el consentimiento de Google. `dns` tiene sus propias rutas. */
const GOOGLE_SOURCE_PARAMS = {
    type: 'object',
    properties: { fuente: { type: 'string', enum: ['youtube', 'adsense'] } },
} as const;

const dnsNotConfigured = {
    code: 'INTERNAL',
    message: 'La verificación por DNS todavía no está configurada.',
};

export function registerListingRoutes(app: FastifyInstance, c: Container): void {
    /*
     * Lo que sabe de sí mismo cada tipo de activo.
     *
     * Es metadata del catálogo, no de una publicación: la usan el formulario
     * de publicar y los filtros del mercado, que existen antes de que haya un
     * activo. Sin autenticar porque no dice nada de nadie — describe la forma
     * de un canal y la de un sitio, que es información pública del producto.
     */
    app.get<{ Reply: AssetTypeDescriptorDto[] }>('/asset-types', async (_request, reply) => {
        return reply.send(describeAssetTypes() as AssetTypeDescriptorDto[]);
    });


    app.get<{ Querystring: ListingFiltersQuery; Reply: ListingSummaryDto[] }>(
        '/listings',
        {
            schema: {
                querystring: {
                    type: 'object',
                    properties: {
                        // Del enum, no de una lista a mano: sumar un tipo de activo no
                        // debería exigir acordarse de tocar también este schema.
                        assetType: { type: 'string', enum: Object.values(AssetType) },
                        niche: { type: 'string', enum: ASSET_NICHES },
                        onlyTransferable: { type: 'boolean' },
                        currency: { type: 'string', enum: ['ARS', 'USD'] },
                        // `coerceTypes` de Fastify convierte el string del query
                        // a número; sin el schema llegarían como texto.
                        minPrice: { type: 'integer', minimum: 0 },
                        maxPrice: { type: 'integer', minimum: 0 },
                        minSubscribers: { type: 'integer', minimum: 0 },
                        onlyMonetized: { type: 'boolean' },
                        sort: { type: 'string', enum: ['relevance', 'price', 'created', 'published', 'estimated'] },
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

    /**
     * Valuación de un activo que todavía no existe.
     *
     * No persiste nada: es la misma fórmula que se aplica al listing ya creado,
     * expuesta antes para que el vendedor tenga una referencia mientras decide
     * el precio en vez de descubrirla cuando ya lo fijó.
     */
    app.post<{ Body: EstimateListingRequest; Reply: EstimatedPriceDto }>(
        '/listings/estimate',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const estimado = await c.estimateListingPrice.execute(request.body);
            return reply.send({
                estimatedPrice: {
                    cents: estimado.getCents(),
                    currency: estimado.getCurrency(),
                },
            });
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
                handoverSteps: view.handoverSteps.map(({ id, key, check, description, instruction, title, details, links, phase, stage, gate, requiredActor }) => ({
                    id,
                    key,
                    check,
                    stage,
                    gate,
                    requiredActor,
                    description,
                    instruction,
                    title,
                    details,
                    links,
                    phase,
                })),
                descriptor: view.descriptor,
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
        { preHandler: [authenticate], schema: { params: GOOGLE_SOURCE_PARAMS } },
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
     * Titularidad de un sitio por registro TXT: el registro que el vendedor
     * tiene que cargar. No escribe nada, así que se puede pedir las veces que
     * haga falta. Sin `DNS_CHALLENGE_SECRET` no hay forma de derivarlo.
     */
    app.get<{ Params: IdParams; Reply: DomainOwnershipChallengeDto }>(
        '/listings/:id/verificacion-dns',
        { preHandler: [authenticate] },
        async (request, reply) => {
            if (!c.getDomainOwnershipChallenge) {
                return reply.code(503).send(dnsNotConfigured as never);
            }

            const challenge = await c.getDomainOwnershipChallenge.execute(
                request.params.id,
                actorOf(request),
            );

            return reply.send({
                ...challenge,
                provider: identifyDnsProvider(challenge.nameservers),
            });
        },
    );

    /**
     * Comprueba si el TXT ya está publicado. Que todavía no esté es una
     * respuesta (`verified: false`), no un error. Ruta estática: tiene
     * prioridad sobre `/verificar/:fuente`, que es la de los flujos de Google
     * con código de OAuth.
     */
    app.post<{ Params: IdParams; Reply: DomainOwnershipVerificationDto }>(
        '/listings/:id/verificar/dns',
        { preHandler: [authenticate] },
        async (request, reply) => {
            if (!c.verifyDomainOwnership) {
                return reply.code(503).send(dnsNotConfigured as never);
            }

            const result = await c.verifyDomainOwnership.execute(request.params.id, actorOf(request));
            return reply.send(result);
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
                params: GOOGLE_SOURCE_PARAMS,
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

    /**
     * Publica sin revisión. Solo procede con la titularidad ya comprobada; si
     * no, 409 y el vendedor sigue por `/submit`.
     */
    app.post<{ Params: IdParams }>(
        '/listings/:id/publish',
        { preHandler: [authenticate] },
        async (request, reply) => {
            await c.publishListing.execute(request.params.id, actorOf(request));
            return reply.code(204).send();
        },
    );

    /**
     * El vendedor avisa que ya invitó a la plataforma. No registra el acceso:
     * deja el activo en «verificando» hasta que un admin lo confirme.
     */
    app.post<{ Params: IdParams }>(
        '/listings/:id/acceso-solicitado',
        { preHandler: [authenticate] },
        async (request, reply) => {
            await c.requestPlatformAccess.execute(request.params.id, actorOf(request));
            return reply.code(204).send();
        },
    );

    /**
     * Edita un listing propio. En borrador o rechazado admite rubro, sin rostro
     * y precio; publicado, solo el precio.
     */
    app.patch<{ Params: IdParams; Body: EditListingRequest }>(
        '/listings/:id',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        niche: { type: 'string' },
                        hasNoFaceContent: { type: 'boolean' },
                        askingPrice: {
                            type: 'object',
                            required: ['cents', 'currency'],
                            properties: {
                                cents: { type: 'integer' },
                                currency: { type: 'string', enum: ['ARS', 'USD'] },
                            },
                        },
                    },
                },
            },
        },
        async (request, reply) => {
            await c.editListing.execute(request.params.id, request.body, actorOf(request));
            return reply.code(204).send();
        },
    );

    /** Elimina un borrador o rechazado propio. */
    app.delete<{ Params: IdParams }>(
        '/listings/:id',
        { preHandler: [authenticate] },
        async (request, reply) => {
            await c.deleteDraftListing.execute(request.params.id, actorOf(request));
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
                offers.map(({ operation: op, buyerName }): OfferSummaryDto => ({
                    id: op.id.toString(),
                    buyerName,
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
