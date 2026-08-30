import { FastifyInstance } from 'fastify';
import { Container } from '../container';
import { authenticate, actorOf } from '../plugins/authenticate';
import type { CounterOfferRequest } from '@marketplace/api-contract';

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

    const pasos: Array<[string, (id: string, actor: ReturnType<typeof actorOf>) => Promise<void>]> = [
        ['accept', (id, actor) => c.acceptOffer.execute(id, actor)],
        ['cancel', (id, actor) => c.cancelOperation.execute(id, actor)],
        ['transfer', (id, actor) => c.initiateTransfer.execute(id, actor)],
        ['custody', (id, actor) => c.confirmCustody.execute(id, actor)],
        ['payment', (id, actor) => c.confirmPayment.execute(id, actor)],
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
