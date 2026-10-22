import { FastifyInstance } from 'fastify';
import { Container } from '../container';
import { authenticate, actorOf } from '../plugins/authenticate';
import { assertIsAdmin } from '@marketplace/domain/src/ports/Actor';
import { ValidationError } from '@marketplace/domain/src/errors/DomainError';
import { ReceiptRecipient } from '@marketplace/domain/src/entities/Operation';
import { MAX_RECEIPT_BYTES } from '@marketplace/domain/src/use-cases/operation/PaymentReceiptUseCases';
import type {
    CheckoutDto,
    CompleteOperationRequest,
    ConfirmCustodyRequest,
    ConfirmPaymentRequest,
    CounterOfferRequest,
    DeclareRecipientIdentityRequest,
    AttestTransferStepRequest,
    RejectTransferRequest,
    ReceiptDecisionRequest,
    DomainCustodyCheckDto,
    DomainDeliveryCheckDto,
    InitiateTransferRequest,
    PaymentOptionsDto,
    TransferStepAttestationDto,
} from '@marketplace/api-contract';

interface IdParams { id: string }
interface ReceiptParams { id: string; recipient: ReceiptRecipient }

const RECEIPT_PARAMS_SCHEMA = {
    type: 'object',
    required: ['id', 'recipient'],
    properties: { id: { type: 'string' }, recipient: { type: 'string', enum: ['seller', 'platform'] } },
} as const;

/** Un poco más que el máximo del dominio, para que el motivo del rechazo lo dé el dominio. */
const RECEIPT_BODY_LIMIT = MAX_RECEIPT_BYTES + 1024 * 1024;
interface StepParams { id: string; key: string }

/** El mismo límite que las notas de las demás constancias. */
const MAX_NOTES_LENGTH = 2000;

const priceSchema = {
    body: {
        type: 'object',
        required: ['price'],
        properties: {
            price: {
                type: 'object',
                required: ['cents', 'currency'],
                properties: {
                    cents: { type: 'integer' },
                    currency: { type: 'string' },
                },
            },
        },
    },
} as const;

const custodySchema = {
    body: {
        type: 'object',
        required: ['isPrimaryOwner', 'accessSecured', 'metrics'],
        properties: {
            isPrimaryOwner: { type: 'boolean' },
            accessSecured: { type: 'boolean' },
            // Cada activo trae sus propias métricas: suscriptores en YouTube,
            // visitas en un sitio. El dominio no fija el conjunto.
            metrics: { type: 'object', additionalProperties: { type: 'number' } },
            notes: { type: 'string', maxLength: 2000 },
        },
    },
} as const;

export function registerOperationRoutes(app: FastifyInstance, c: Container): void {
    app.post<{ Params: IdParams; Body: CounterOfferRequest }>(
        '/operations/:id/counter',
        { preHandler: [authenticate], schema: priceSchema },
        async (request, reply) => {
            await c.counterOffer.execute(
                { operationId: request.params.id, price: request.body.price },
                actorOf(request),
            );
            return reply.code(204).send();
        },
    );

    /**
     * El vendedor declara haber cedido el control del activo. Sale del bucle
     * de pasos porque ya no es un botón sin cuerpo: exige afirmar la cesión,
     * calcada de `/complete`.
     */
    app.post<{ Params: IdParams; Body: InitiateTransferRequest }>(
        '/operations/:id/transfer',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['controlCeded'],
                    properties: {
                        controlCeded: { type: 'boolean' },
                        notes: { type: 'string', maxLength: 2000 },
                        sellerSourceIdentity: { type: 'string', maxLength: 320 },
                    },
                },
            },
        },
        async (request, reply) => {
            await c.initiateTransfer.execute(request.params.id, request.body, actorOf(request));
            return reply.code(204).send();
        },
    );

    // Confirmar custodia sale del bucle de pasos porque ya no es un botón: el
    // admin declara qué verificó y esa constancia queda guardada.
    app.post<{ Params: IdParams; Body: ConfirmCustodyRequest }>(
        '/operations/:id/custody',
        { preHandler: [authenticate], schema: custodySchema },
        async (request, reply) => {
            await c.confirmCustody.execute(request.params.id, request.body, actorOf(request));
            return reply.code(204).send();
        },
    );

    /**
     * El admin dispara la comprobación del dominio de un sitio: si el traslado
     * a la cuenta de la plataforma llegó se acepta, y si el dominio ya está en
     * custodia el paso se da por cumplido. Es lo mismo que hará el job
     * periódico; mientras no exista, es la forma de avanzar el paso a mano.
     */
    app.post<{ Params: IdParams; Reply: DomainCustodyCheckDto }>(
        '/admin/operations/:id/check-domain-custody',
        { preHandler: [authenticate] },
        async (request, reply) => {
            assertIsAdmin(actorOf(request));

            if (!c.checkDomainCustody) {
                return reply.code(503).send({
                    code: 'INTERNAL',
                    message: 'El registrador de dominios todavía no está configurado.',
                } as never);
            }

            const status = await c.checkDomainCustody.execute(request.params.id);
            return reply.send({ status });
        },
    );

    /**
     * El admin inicia la entrega del dominio de un sitio: un traslado saliente
     * de la cuenta de Hostinger de la plataforma a la del comprador.
     */
    app.post<{ Params: IdParams; Reply: DomainDeliveryCheckDto }>(
        '/admin/operations/:id/deliver-domain',
        { preHandler: [authenticate] },
        async (request, reply) => {
            assertIsAdmin(actorOf(request));

            if (!c.startDomainDelivery) {
                return reply.code(503).send({
                    code: 'INTERNAL',
                    message: 'El registrador de dominios todavía no está configurado.',
                } as never);
            }

            const status = await c.startDomainDelivery.execute(request.params.id, actorOf(request));
            return reply.send({ status });
        },
    );

    /** Si el dominio ya llegó a la cuenta del comprador. También lo pregunta el job periódico. */
    app.post<{ Params: IdParams; Reply: DomainDeliveryCheckDto }>(
        '/admin/operations/:id/check-domain-delivery',
        { preHandler: [authenticate] },
        async (request, reply) => {
            assertIsAdmin(actorOf(request));

            if (!c.checkDomainDelivery) {
                return reply.code(503).send({
                    code: 'INTERNAL',
                    message: 'El registrador de dominios todavía no está configurado.',
                } as never);
            }

            const status = await c.checkDomainDelivery.execute(request.params.id);
            return reply.send({ status });
        },
    );

    /**
     * El admin da por cumplido un paso declarado de la entrega (hosting, código,
     * cuentas asociadas). Los pasos que se comprueban solos no pasan por acá.
     *
     * Sin schema de cuerpo a propósito: las notas son opcionales y Fastify
     * rechaza con 400 un POST sin cuerpo si declara uno de tipo objeto.
     */
    app.post<{ Params: StepParams; Body: AttestTransferStepRequest | undefined; Reply: TransferStepAttestationDto }>(
        '/admin/operations/:id/steps/:key/attest',
        { preHandler: [authenticate] },
        async (request, reply) => {
            // El rol primero: a quien no es admin no se le contesta sobre su cuerpo.
            assertIsAdmin(actorOf(request));

            const notes = request.body?.notes;
            if (notes !== undefined && (typeof notes !== 'string' || notes.length > MAX_NOTES_LENGTH)) {
                throw new ValidationError(`Las notas tienen que ser un texto de hasta ${MAX_NOTES_LENGTH} caracteres.`);
            }

            const status = await c.attestTransferStep.execute(
                request.params.id,
                request.params.key,
                actorOf(request),
                notes,
            );
            return reply.send({ status });
        },
    );

    /*
     * Los comprobantes de la transferencia dividida. El archivo viaja crudo
     * (`application/octet-stream`) y su tipo se comprueba por los bytes en el
     * dominio: el nombre y el tipo que manda el navegador no prueban nada.
     */
    app.post<{ Params: ReceiptParams; Body: Buffer }>(
        '/operations/:id/receipts/:recipient',
        { preHandler: [authenticate], schema: { params: RECEIPT_PARAMS_SCHEMA }, bodyLimit: RECEIPT_BODY_LIMIT },
        async (request, reply) => {
            if (!Buffer.isBuffer(request.body)) {
                throw new ValidationError('Mandá el comprobante como archivo.');
            }
            await c.uploadPaymentReceipt.execute(
                request.params.id,
                request.params.recipient,
                new Uint8Array(request.body),
                actorOf(request),
            );
            return reply.code(204).send();
        },
    );

    app.post<{ Params: ReceiptParams; Body: ReceiptDecisionRequest }>(
        '/operations/:id/receipts/:recipient/decision',
        {
            preHandler: [authenticate],
            schema: {
                params: RECEIPT_PARAMS_SCHEMA,
                body: {
                    type: 'object',
                    required: ['confirm'],
                    properties: { confirm: { type: 'boolean' }, reason: { type: 'string', maxLength: MAX_NOTES_LENGTH } },
                },
            },
        },
        async (request, reply) => {
            const body = request.body;
            const decision = body.confirm ? { confirm: true as const } : { confirm: false as const, reason: body.reason ?? '' };
            await c.decidePaymentReceipt.execute(request.params.id, request.params.recipient, decision, actorOf(request));
            return reply.code(204).send();
        },
    );

    app.get<{ Params: ReceiptParams }>(
        '/operations/:id/receipts/:recipient/file',
        { preHandler: [authenticate], schema: { params: RECEIPT_PARAMS_SCHEMA } },
        async (request, reply) => {
            const file = await c.getPaymentReceiptFile.execute(request.params.id, request.params.recipient, actorOf(request));
            return reply
                .header('content-type', file.contentType)
                .header('cache-control', 'private, no-store')
                .header('x-content-type-options', 'nosniff')
                .send(Buffer.from(file.bytes));
        },
    );

    /**
     * Un admin rechaza la declaración de cesión: el vendedor dijo que cedió y
     * el activo no llegó. La operación vuelve a «contrato firmado».
     */
    app.post<{ Params: IdParams; Body: RejectTransferRequest }>(
        '/admin/operations/:id/reject-transfer',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['reason'],
                    properties: { reason: { type: 'string', maxLength: MAX_NOTES_LENGTH } },
                },
            },
        },
        async (request, reply) => {
            await c.rejectTransfer.execute(request.params.id, request.body.reason, actorOf(request));
            return reply.code(204).send();
        },
    );

    /**
     * El comprador pide su link de pago. Solo con el activo en custodia: es la
     * regla central del escrow y se hace cumplir antes de generarlo.
     */
    app.post<{ Params: IdParams; Reply: CheckoutDto }>(
        '/operations/:id/checkout',
        { preHandler: [authenticate] },
        async (request, reply) => {
            if (!c.crearCheckout) {
                return reply.code(503).send({
                    code: 'INTERNAL',
                    message: 'Los pagos con MercadoPago todavía no están configurados.',
                } as never);
            }

            const checkout = await c.crearCheckout.execute(request.params.id, actorOf(request));
            return reply.send({ url: checkout.url });
        },
    );

    /**
     * Cómo puede pagar el comprador. Siempre responde: una opción que no está
     * disponible se informa, no es un error. Solo para las partes y los admins.
     */
    app.get<{ Params: IdParams; Reply: PaymentOptionsDto }>(
        '/operations/:id/payment-options',
        { preHandler: [authenticate] },
        async (request) => c.paymentOptions.execute(request.params.id, actorOf(request)),
    );

    /**
     * Registro de una transferencia bancaria. Los pagos de MercadoPago no pasan
     * por acá: los confirma el webhook contra la propia pasarela.
     */
    app.post<{ Params: IdParams; Body: ConfirmPaymentRequest }>(
        '/operations/:id/payment',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['method', 'amountCents', 'currency'],
                    properties: {
                        method: { type: 'string', minLength: 1 },
                        amountCents: { type: 'integer', minimum: 1 },
                        currency: { type: 'string', minLength: 3, maxLength: 3 },
                    },
                },
            },
        },
        async (request, reply) => {
            await c.confirmPayment.execute(request.params.id, request.body, actorOf(request));
            return reply.code(204).send();
        },
    );

    /**
     * El comprador declara dónde quiere recibir el activo. Es una tarea
     * pendiente suya: se puede resolver desde `contract_pending` y es
     * inevitable recién al cerrar. La autorización —que sea el comprador— vive
     * en la entidad.
     */
    app.post<{ Params: IdParams; Body: DeclareRecipientIdentityRequest }>(
        '/operations/:id/recipient-identity',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['identifier'],
                    properties: {
                        identifier: { type: 'string', minLength: 1, maxLength: 320 },
                    },
                },
            },
        },
        async (request, reply) => {
            await c.declareRecipientIdentity.execute(
                request.params.id,
                request.body,
                actorOf(request),
            );
            return reply.code(204).send();
        },
    );

    /**
     * Cierre de la operación: registra la constancia de entrega y transiciona
     * a `completed` en un solo acto. `deliveredToIdentifier` no viaja en el
     * body: lo copia el dominio de la identidad que el comprador declaró.
     */
    app.post<{ Params: IdParams; Body: CompleteOperationRequest }>(
        '/operations/:id/complete',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['buyerIsPrimaryOwner', 'accessTransferred', 'sellerRemoved'],
                    properties: {
                        buyerIsPrimaryOwner: { type: 'boolean' },
                        accessTransferred: { type: 'boolean' },
                        sellerRemoved: { type: 'boolean' },
                        notes: { type: 'string', maxLength: 2000 },
                    },
                },
            },
        },
        async (request, reply) => {
            await c.completeOperation.execute(request.params.id, request.body, actorOf(request));
            return reply.code(204).send();
        },
    );

    const pasos: Array<[string, (id: string, actor: ReturnType<typeof actorOf>) => Promise<void>]> = [
        ['accept', (id, actor) => c.acceptOffer.execute(id, actor)],
        ['cancel', (id, actor) => c.cancelOperation.execute(id, actor)],
    ];

    // Todos comparten la misma forma: id en la ruta, actor del token, 204 al
    // terminar. La autorización de cada paso vive en su use case.
    for (const [segmento, ejecutar] of pasos) {
        app.post<{ Params: IdParams }>(
            `/operations/:id/${segmento}`,
            { preHandler: [authenticate] },
            async (request, reply) => {
                await ejecutar(request.params.id, actorOf(request));
                return reply.code(204).send();
            },
        );
    }
}
