import { FastifyInstance } from 'fastify';
import type {
    ContractDto,
    MyProfileDto,
    NotificationDto,
    NotificationsDto,
    VerifyIdentityRequest,
    MyListingDto,
    PlatformDashboardDto,
    MyOperationDto,
    OperationDetailDto,
    RegisterPlatformAccessRequest,
} from '@marketplace/api-contract';
import { Listing } from '@marketplace/domain/src/entities/Listing';
import { Operation } from '@marketplace/domain/src/entities/Operation';
import { Contract } from '@marketplace/domain/src/entities/Contract';
import { User } from '@marketplace/domain/src/entities/User';
import { Notification } from '@marketplace/domain/src/entities/Notification';
import { Container } from '../container';
import { authenticate, actorOf } from '../plugins/authenticate';

interface IdParams { id: string }

/** Un listing propio expone más que uno público: estado real y motivo de rechazo. */
function aMyListingDto(listing: Listing): MyListingDto {
    const { id, createdAt, props } = listing.toSnapshot();
    return {
        id,
        status: props.status,
        assetType: props.assetStrategy.toJSON().assetType,
        niche: (() => {
            const v = props.assetStrategy.toJSON().assetData.niche;
            return typeof v === 'string' ? v : undefined;
        })(),
        askingPrice: {
            cents: props.askingPrice.getCents(),
            currency: props.askingPrice.getCurrency(),
        },
        estimatedPrice: {
            cents: listing.estimatedPrice.getCents(),
            currency: listing.estimatedPrice.getCurrency(),
        },
        rejectionReason: props.rejectionReason,
        ownership: listing.ownershipVerification && {
            verifiedAt: listing.ownershipVerification.verifiedAt.toISOString(),
            source: listing.ownershipVerification.source,
            monthlyRevenueCents: listing.ownershipVerification.monthlyRevenueCents,
        },
        transferable: listing.isReadyToTransfer(),
        transferableFrom: listing.transferableFrom()?.toISOString(),
        handoverSteps: listing.handoverSteps().map(({ id, description, instruction }) => ({ id, description, instruction })),
        createdAt: createdAt.toISOString(),
    };
}

function aMyOperationDto(
    operation: Operation,
    actorId: string,
    activo: { assetType?: string; niche?: string } = {},
): MyOperationDto {
    const { id, createdAt, props } = operation.toSnapshot();

    // partyFor lanza si no es parte; acá siempre lo es, porque la consulta
    // se hizo por el id del actor.
    let miParte: MyOperationDto['miParte'];
    try {
        miParte = operation.partyFor(actorId);
    } catch {
        miParte = undefined;
    }

    return {
        id,
        listingId: props.listingId.toString(),
        assetType: activo.assetType,
        niche: activo.niche,
        status: props.status,
        miParte,
        currentOfferPrice: {
            cents: operation.currentOfferPrice.getCents(),
            currency: operation.currentOfferPrice.getCurrency(),
        },
        pendingResponseFrom: operation.pendingResponseFrom,
        createdAt: createdAt.toISOString(),
    };
}

function aContractDto(contract: Contract): ContractDto {
    return {
        id: contract.id.toString(),
        type: contract.type,
        isFullySigned: contract.isFullySigned(),
    };
}

function aPerfilDto(user: User): MyProfileDto {
    const { id, props } = user.toSnapshot();
    return {
        id,
        email: props.email.getValue(),
        fullName: props.fullName,
        role: props.role,
        isKycVerified: props.isKycVerified,
        dni: props.dni,
        phone: props.phone,
        country: props.country,
        // El hash nunca sale de acá.
    };
}

function aNotificationDto(n: Notification): NotificationDto {
    const { id, createdAt, props } = n.toSnapshot();
    return {
        id,
        type: props.type,
        operationId: props.operationId?.toString(),
        listingId: props.listingId?.toString(),
        amount:
            props.amountCents !== undefined
                ? { cents: props.amountCents, currency: props.currency ?? 'USD' }
                : undefined,
        read: n.isRead,
        createdAt: createdAt.toISOString(),
    };
}

export function registerMeRoutes(app: FastifyInstance, c: Container): void {
    app.get<{ Querystring: { onlyUnread?: boolean }; Reply: NotificationsDto }>(
        '/me/notifications',
        {
            preHandler: [authenticate],
            schema: {
                querystring: {
                    type: 'object',
                    properties: { onlyUnread: { type: 'boolean' } },
                },
            },
        },
        async (request, reply) => {
            const actor = actorOf(request);
            const avisos = await c.misAvisos.execute(actor, request.query.onlyUnread === true);

            return reply.send({
                items: avisos.map(aNotificationDto),
                sinLeer: avisos.filter((n) => !n.isRead).length,
            });
        },
    );

    app.post<{ Params: IdParams }>(
        '/me/notifications/:id/read',
        { preHandler: [authenticate] },
        async (request, reply) => {
            await c.marcarAvisoLeido.execute(request.params.id, actorOf(request));
            return reply.code(204).send();
        },
    );

    app.get<{ Reply: MyProfileDto }>(
        '/me',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const user = await c.perfil.execute(actorOf(request));
            return reply.send(aPerfilDto(user));
        },
    );

    app.post<{ Body: VerifyIdentityRequest; Reply: MyProfileDto }>(
        '/me/kyc',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['dni'],
                    properties: {
                        dni: { type: 'string' },
                        phone: { type: 'string' },
                        country: { type: 'string' },
                    },
                },
            },
        },
        async (request, reply) => {
            const user = await c.verifyIdentity.execute(request.body, actorOf(request));
            return reply.send(aPerfilDto(user));
        },
    );

    app.get<{ Reply: MyListingDto[] }>(
        '/me/listings',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const listings = await c.misListings.execute(actorOf(request));
            return reply.send(listings.map(aMyListingDto));
        },
    );

    app.get<{ Reply: MyOperationDto[] }>(
        '/me/operations',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const actor = actorOf(request);
            const operaciones = await c.misOperaciones.execute(actor);
            return reply.send(
                operaciones.map((v) => aMyOperationDto(v.operation, actor.id, v)),
            );
        },
    );

    app.get<{ Reply: MyListingDto[] }>(
        '/admin/listings',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const listings = await c.listingsParaRevisar.execute(actorOf(request));
            return reply.send(listings.map(aMyListingDto));
        },
    );

    /** El tablero de la plataforma: qué hay pendiente y en qué estado va todo. */
    app.get<{ Reply: PlatformDashboardDto }>(
        '/admin/dashboard',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const t = await c.tableroDePlataforma.execute(actorOf(request));

            return reply.send({
                listingsToReview: t.listingsToReview,
                publishedListings: t.publishedListings,
                operationsInProgress: t.operationsInProgress,
                openReports: t.openReports,
                earned: { cents: t.earnedCents, currency: t.currency },
                pending: t.pending.map((p) => ({
                    id: p.id,
                    status: p.status,
                    listingId: p.listingId,
                    amount:
                        p.amountCents === undefined || p.currency === undefined
                            ? undefined
                            : { cents: p.amountCents, currency: p.currency },
                    waitingSince: p.waitingSince.toISOString(),
                })),
            });
        },
    );

    /**
     * El acceso de la plataforma al activo. Es manual y no automatizable: la
     * API de YouTube no expone quiénes son los propietarios de un canal, así
     * que solo un admin puede atestiguarlo. De la fecha registrada se deriva
     * cuándo el activo queda transferible.
     */
    app.post<{ Params: IdParams; Body: RegisterPlatformAccessRequest }>(
        '/admin/listings/:id/acceso',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['accessSince'],
                    properties: {
                        accessSince: { type: 'string', format: 'date-time' },
                        notes: { type: 'string', maxLength: 2000 },
                    },
                },
            },
        },
        async (request, reply) => {
            await c.registerPlatformAccess.execute(request.params.id, request.body, actorOf(request));
            return reply.code(204).send();
        },
    );

    /** Cuando el vendedor expulsó a la plataforma. Ninguna API nos lo avisa. */
    app.delete<{ Params: IdParams }>(
        '/admin/listings/:id/acceso',
        { preHandler: [authenticate] },
        async (request, reply) => {
            await c.revokePlatformAccess.execute(request.params.id, actorOf(request));
            return reply.code(204).send();
        },
    );

    app.get<{ Params: IdParams; Reply: OperationDetailDto }>(
        '/operations/:id',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const vista = await c.detalleOperacion.execute(request.params.id, actorOf(request));
            const { operation, asset, miParte, contratos, buyer, seller } = vista;
            const { id, createdAt, props } = operation.toSnapshot();

            const dinero = (m?: { getCents(): number; getCurrency(): string }) =>
                m ? { cents: m.getCents(), currency: m.getCurrency() } : undefined;

            const dto: OperationDetailDto = {
                id,
                listingId: props.listingId.toString(),
                assetType: asset?.assetType,
                niche: asset?.niche,
                transferable: asset?.transferable,
                transferableFrom: asset?.transferableFrom?.toISOString(),
                status: props.status,
                miParte,
                buyer,
                seller,
                currentOfferPrice: {
                    cents: operation.currentOfferPrice.getCents(),
                    currency: operation.currentOfferPrice.getCurrency(),
                },
                pendingResponseFrom: operation.pendingResponseFrom,
                finalPrice: dinero(operation.finalPrice),
                buyerPays: dinero(operation.buyerPays),
                sellerReceives: dinero(operation.sellerReceives),
                platformEarns: dinero(operation.platformEarns),
                negotiations: operation.negotiations.map((n) => ({
                    amount: n.amount,
                    currency: n.currency,
                    proposedBy: n.proposedBy,
                    proposedAt: n.proposedAt.toISOString(),
                })),
                payment: props.payment && {
                    ...props.payment,
                    confirmedAt: props.payment.confirmedAt.toISOString(),
                },
                contracts: contratos.map(aContractDto),
                custody: props.custodyVerification && {
                    ...props.custodyVerification,
                    verifiedBy: props.custodyVerification.verifiedBy.toString(),
                    verifiedAt: props.custodyVerification.verifiedAt.toISOString(),
                },
                createdAt: createdAt.toISOString(),
            };

            return reply.send(dto);
        },
    );
}
