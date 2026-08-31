import { FastifyInstance } from 'fastify';
import { Container } from '../container';
import { authenticate, actorOf } from '../plugins/authenticate';
import type {
    CheckoutDto,
    ConfirmCustodyRequest,
    ConfirmPaymentRequest,
    CounterOfferRequest,
} from '@marketplace/api-contract';

interface IdParams { id: string }

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

    const pasos: Array<[string, (id: string, actor: ReturnType<typeof actorOf>) => Promise<void>]> = [
        ['accept', (id, actor) => c.acceptOffer.execute(id, actor)],
        ['cancel', (id, actor) => c.cancelOperation.execute(id, actor)],
        ['transfer', (id, actor) => c.initiateTransfer.execute(id, actor)],
        ['complete', (id, actor) => c.completeOperation.execute(id, actor)],
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
