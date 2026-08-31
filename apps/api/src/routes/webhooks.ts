import { FastifyInstance } from 'fastify';
import { Container } from '../container';
import { firmaValida } from '../adapters/MercadoPagoSignature';

interface AvisoDeMercadoPago {
    type?: string;
    action?: string;
    data?: { id?: string };
}

/**
 * Aviso de MercadoPago.
 *
 * No lleva autenticación de usuario —la llama MercadoPago, no una persona— y
 * del cuerpo se toma únicamente el identificador del pago. El estado, el monto
 * y la referencia se consultan después contra la pasarela con nuestras
 * credenciales, así que un aviso falsificado no puede dar por pagada una
 * operación: en el peor caso provoca una consulta que no encuentra nada.
 *
 * Siempre responde 200. Un error nuestro devuelto como 500 haría que
 * MercadoPago reintente el aviso indefinidamente; los problemas se registran
 * en el log y se resuelven mirándolo, no haciendo reintentar a la pasarela.
 */
export function registerWebhookRoutes(app: FastifyInstance, c: Container): void {
    app.post<{ Body: AvisoDeMercadoPago; Querystring: { 'data.id'?: string } }>(
        '/webhooks/mercadopago',
        async (request, reply) => {
            const paymentId = request.body?.data?.id ?? request.query['data.id'];

            if (!paymentId || !c.confirmarPagoDePasarela) {
                return reply.code(200).send({ received: true });
            }

            // Solo interesan los avisos de pago; MercadoPago manda varios tipos.
            const tipo = request.body?.type ?? request.body?.action;
            if (tipo && !String(tipo).startsWith('payment')) {
                return reply.code(200).send({ received: true });
            }

            // Defensa en profundidad: la principal es consultar el pago contra
            // la pasarela, que es lo que hace el use case.
            if (c.mercadoPagoWebhookSecret) {
                const valida = firmaValida({
                    signature: request.headers['x-signature'] as string | undefined,
                    requestId: request.headers['x-request-id'] as string | undefined,
                    dataId: paymentId,
                    secret: c.mercadoPagoWebhookSecret,
                });

                if (!valida) {
                    request.log.warn({ paymentId }, 'Aviso de MercadoPago con firma inválida');
                    return reply.code(200).send({ received: true });
                }
            }

            try {
                await c.confirmarPagoDePasarela.execute(paymentId);
            } catch (error) {
                request.log.error({ err: error, paymentId }, 'No se pudo procesar el aviso de pago');
            }

            return reply.code(200).send({ received: true });
        },
    );
}
