import { FastifyInstance } from 'fastify';
import { Container } from '../container';
import { authenticate, actorOf } from '../plugins/authenticate';
import type { ContractDocumentDto } from '@marketplace/api-contract';

interface IdParams { id: string }

export function registerContractRoutes(app: FastifyInstance, c: Container): void {
    app.get<{ Params: IdParams; Reply: ContractDocumentDto }>(
        '/contracts/:id/documento',
        { preHandler: [authenticate] },
        async (request, reply) => {
            const doc = await c.documentoDelContrato.execute(request.params.id, actorOf(request));
            return reply.send(doc);
        },
    );

    app.post<{ Params: IdParams }>(
        '/contracts/:id/sign',
        { preHandler: [authenticate] },
        async (request, reply) => {
            // Ni el rol ni la IP los elige el cliente: el rol se deriva de la
            // operación y la IP la observa el servidor.
            await c.signContract.execute(request.params.id, request.ip, actorOf(request));
            return reply.code(204).send();
        },
    );
}
