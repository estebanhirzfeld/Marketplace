import { FastifyInstance, FastifyReply } from 'fastify';
import type {
    AuthorizationUrlDto,
    LinkMercadoPagoRequest,
    MercadoPagoAuthorizationRequest,
    SellerPaymentAccountStatusDto,
} from '@marketplace/api-contract';
import { Container } from '../container';
import { authenticate, actorOf } from '../plugins/authenticate';

/**
 * La cuenta de Mercado Pago del vendedor.
 *
 * Estas rutas nunca devuelven ni registran tokens, códigos ni verificadores:
 * los cuerpos de los pedidos no se loguean. El `state` y el par PKCE los genera
 * la capa web; acá solo se arma la dirección y se canjea el código.
 */

/** Mismo estilo que las rutas de Google: 503, no 500, mientras no esté configurado. */
function noConfigurado(reply: FastifyReply) {
    return reply.code(503).send({
        code: 'INTERNAL',
        message: 'La vinculación con Mercado Pago todavía no está configurada.',
    } as never);
}

export function registerPaymentAccountRoutes(app: FastifyInstance, c: Container): void {
    app.get<{ Reply: SellerPaymentAccountStatusDto }>(
        '/me/mercadopago',
        { preHandler: [authenticate] },
        async (request, reply) => {
            if (!c.getSellerPaymentAccountStatus) return noConfigurado(reply);

            const estado = await c.getSellerPaymentAccountStatus.execute(actorOf(request));
            if (!estado.linked) {
                return reply.send({ linked: false });
            }

            return reply.send({
                linked: true,
                mpUserId: estado.mpUserId,
                linkedAt: estado.linkedAt.toISOString(),
                expiresAt: estado.expiresAt.toISOString(),
                expired: estado.expired,
            });
        },
    );

    app.post<{ Body: MercadoPagoAuthorizationRequest; Reply: AuthorizationUrlDto }>(
        '/me/mercadopago/authorization',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['state', 'codeChallenge'],
                    additionalProperties: false,
                    properties: {
                        state: { type: 'string', minLength: 1, maxLength: 512 },
                        // El desafío PKCE S256 es un SHA-256 en base64url (43 caracteres).
                        codeChallenge: {
                            type: 'string',
                            minLength: 1,
                            maxLength: 128,
                            pattern: '^[A-Za-z0-9_-]+$',
                        },
                    },
                },
            },
        },
        async (request, reply) => {
            if (!c.mercadoPagoOAuth) return noConfigurado(reply);

            return reply.send({
                url: c.mercadoPagoOAuth.authorizationUrl({
                    state: request.body.state,
                    codeChallenge: request.body.codeChallenge,
                }),
            });
        },
    );

    app.post<{ Body: LinkMercadoPagoRequest }>(
        '/me/mercadopago/link',
        {
            preHandler: [authenticate],
            schema: {
                body: {
                    type: 'object',
                    required: ['code', 'codeVerifier'],
                    additionalProperties: false,
                    properties: {
                        code: { type: 'string', minLength: 1, maxLength: 512 },
                        // RFC 7636: de 43 a 128 caracteres del conjunto no reservado.
                        codeVerifier: {
                            type: 'string',
                            minLength: 43,
                            maxLength: 128,
                            pattern: '^[A-Za-z0-9._~-]+$',
                        },
                    },
                },
            },
        },
        async (request, reply) => {
            if (!c.linkSellerPaymentAccount) return noConfigurado(reply);

            await c.linkSellerPaymentAccount.execute(request.body, actorOf(request));
            return reply.code(204).send();
        },
    );

    app.delete(
        '/me/mercadopago',
        { preHandler: [authenticate] },
        async (request, reply) => {
            if (!c.unlinkSellerPaymentAccount) return noConfigurado(reply);

            await c.unlinkSellerPaymentAccount.execute(actorOf(request));
            return reply.code(204).send();
        },
    );
}
