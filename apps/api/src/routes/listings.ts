import { FastifyInstance } from 'fastify';
import { Container } from '../container';
import { authenticate, authenticateOptional, actorOf } from '../plugins/authenticate';
import type {
    ContractDto,
    CreateListingRequest,
    CreateOfferRequest,
    CreatedListingDto,
    CreatedOperationDto,
    ListingDetailDto,
    ListingFiltersQuery,
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
                        assetType: { type: 'string' },
                        // `coerceTypes` de Fastify convierte el string del query
                        // a número; sin el schema llegarían como texto.
                        minPrice: { type: 'integer', minimum: 0 },
                        maxPrice: { type: 'integer', minimum: 0 },
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
                isBlind: v.isBlind,
                assetData: v.assetData,
                hiddenFields: v.hiddenFields,
                createdAt: v.createdAt.toISOString(),
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
            const dto: ListingDetailDto = { ...view, createdAt: view.createdAt.toISOString() };
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
                    required: ['assetType', 'assetData', 'askingPrice', 'isBlind'],
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
                        isBlind: { type: 'boolean' },
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
