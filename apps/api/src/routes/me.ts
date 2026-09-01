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
    CustodyAccountDto,
    CreateCustodyAccountRequest,
    UpdateCustodyAccountRequest,
} from '@marketplace/api-contract';
import { Listing } from '@marketplace/domain/src/entities/Listing';
import { CustodyAccount } from '@marketplace/domain/src/entities/CustodyAccount';
import { TransferStep } from '@marketplace/domain/src/strategies/IAssetStrategy';
import { AssetType } from '@marketplace/shared-types';
import { Operation } from '@marketplace/domain/src/entities/Operation';
import { Contract } from '@marketplace/domain/src/entities/Contract';
import { User } from '@marketplace/domain/src/entities/User';
import { Notification } from '@marketplace/domain/src/entities/Notification';
import { Container } from '../container';
import { authenticate, actorOf } from '../plugins/authenticate';

interface IdParams { id: string }

/** Un listing propio expone más que uno público: estado real y motivo de rechazo. */
/**
 * El nombre del activo, para su propio dueño.
 *
 * `true` porque este mapeo solo se usa en el catálogo del vendedor, que se
 * consulta por su id: no hay forma de que devuelva el activo de otro.
 */
function nombreDelActivo(listing: Listing): string | undefined {
    const valor = listing.assetDataFor(true).assetData.name;
    return typeof valor === 'string' && valor ? valor : undefined;
}

/**
 * Los pasos de traspaso los resuelve el use case —puede nombrar la cuenta de
 * custodia concreta, y para eso hace falta consultar persistencia, que no
 * corresponde a la capa de transporte. Cuando no vienen (cola de revisión del
 * admin), se cae a la variante genérica de la entidad.
 */
function aMyListingDto(listing: Listing, handoverSteps?: TransferStep[]): MyListingDto {
    const { id, createdAt, props } = listing.toSnapshot();
    const pasos = handoverSteps ?? listing.handoverSteps();
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
        assetName: nombreDelActivo(listing),
        rejectionReason: props.rejectionReason,
        ownership: listing.ownershipVerification && {
            verifiedAt: listing.ownershipVerification.verifiedAt.toISOString(),
            source: listing.ownershipVerification.source,
            monthlyRevenueCents: listing.ownershipVerification.monthlyRevenueCents,
        },
        transferable: listing.isReadyToTransfer(),
        transferableFrom: listing.transferableFrom()?.toISOString(),
        handoverSteps: pasos.map(({ id, description, instruction }) => ({ id, description, instruction })),
        descriptor: listing.describeAssetType(),
        createdAt: createdAt.toISOString(),
    };
}

function aMyOperationDto(
    operation: Operation,
    actorId: string,
    activo: { assetType?: string; niche?: string; name?: string } = {},
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
        assetName: activo.name,
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
            const vistas = await c.misListings.execute(actorOf(request));
            return reply.send(vistas.map((v) => aMyListingDto(v.listing, v.handoverSteps)));
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
            return reply.send(listings.map((l) => aMyListingDto(l)));
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
                    assetName: p.assetName,
                    assetType: p.assetType,
                    buyerName: p.buyerName,
                    sellerName: p.sellerName,
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
                    required: ['accessSince', 'custodyAccountId'],
                    properties: {
                        accessSince: { type: 'string', format: 'date-time' },
                        custodyAccountId: { type: 'string', minLength: 1 },
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

    // ── ABM de cuentas de custodia (solo admin) ────────────
    //
    // La autorización la hace cada use case con `assertIsAdmin`: estas rutas no
    // agregan un chequeo propio, delegan.

    const aCustodyAccountDto = (account: CustodyAccount, heldAssets: number): CustodyAccountDto => ({
        id: account.id.toString(),
        label: account.label,
        identifier: account.identifier,
        assetType: account.assetType,
        isActive: account.isActive,
        notes: account.notes,
        heldAssets,
        createdAt: account.createdAt.toISOString(),
    });

    app.get<{ Reply: CustodyAccountDto[] }>(
        '/admin/custody-accounts',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const filas = await c.listarCuentasCustodia.execute(actorOf(request));
            return reply.send(filas.map((f) => aCustodyAccountDto(f.account, f.heldAssets)));
        },
    );

    app.post<{ Body: CreateCustodyAccountRequest; Reply: CustodyAccountDto }>(
        '/admin/custody-accounts',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['label', 'identifier', 'assetType'],
                    properties: {
                        label: { type: 'string', minLength: 1, maxLength: 200 },
                        identifier: { type: 'string', minLength: 1, maxLength: 320 },
                        assetType: { type: 'string', enum: ['youtube', 'web'] },
                        notes: { type: 'string', maxLength: 2000 },
                    },
                },
            },
        },
        async (request, reply) => {
            const cuenta = await c.crearCuentaCustodia.execute(
                { ...request.body, assetType: request.body.assetType as AssetType },
                actorOf(request),
            );
            return reply.code(201).send(aCustodyAccountDto(cuenta, 0));
        },
    );

    app.patch<{ Params: IdParams; Body: UpdateCustodyAccountRequest; Reply: CustodyAccountDto }>(
        '/admin/custody-accounts/:id',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    properties: {
                        label: { type: 'string', minLength: 1, maxLength: 200 },
                        identifier: { type: 'string', minLength: 1, maxLength: 320 },
                        assetType: { type: 'string', enum: ['youtube', 'web'] },
                        notes: { type: 'string', maxLength: 2000 },
                    },
                },
            },
        },
        async (request, reply) => {
            const cuenta = await c.editarCuentaCustodia.execute(
                request.params.id,
                { ...request.body, assetType: request.body.assetType as AssetType | undefined },
                actorOf(request),
            );
            return reply.send(aCustodyAccountDto(cuenta, 0));
        },
    );

    app.post<{ Params: IdParams }>(
        '/admin/custody-accounts/:id/baja',
        { preHandler: [authenticate] },
        async (request, reply) => {
            await c.darDeBajaCuentaCustodia.execute(request.params.id, actorOf(request));
            return reply.code(204).send();
        },
    );

    app.post<{ Params: IdParams }>(
        '/admin/custody-accounts/:id/alta',
        { preHandler: [authenticate] },
        async (request, reply) => {
            await c.activarCuentaCustodia.execute(request.params.id, actorOf(request));
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
                assetName: asset?.name,
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
                recipientIdentity: operation.recipientIdentity && {
                    identifier: operation.recipientIdentity.identifier,
                    declaredAt: operation.recipientIdentity.declaredAt.toISOString(),
                    notes: operation.recipientIdentity.notes,
                },
                delivery: operation.deliveryCheck && {
                    ...operation.deliveryCheck,
                    verifiedBy: operation.deliveryCheck.verifiedBy.toString(),
                    verifiedAt: operation.deliveryCheck.verifiedAt.toISOString(),
                },
                createdAt: createdAt.toISOString(),
            };

            return reply.send(dto);
        },
    );
}
