import { FastifyRequest, FastifyReply } from 'fastify';
import { Actor } from '@marketplace/domain/src/ports/Actor';

declare module 'fastify' {
    interface FastifyRequest {
        /** Actor autenticado. Solo presente después de `authenticate`. */
        actor?: Actor;
    }
}

declare module '@fastify/jwt' {
    interface FastifyJWT {
        payload: Actor;
        user: Actor;
    }
}

/**
 * Autenticación: verifica el JWT y adjunta el actor al request.
 *
 * Acá termina la responsabilidad de la capa HTTP. Quién puede hacer qué lo
 * decide el dominio, que recibe este actor como parámetro.
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
        // jwtVerify() puebla `request.user`, que el module augmentation de
        // arriba tipa como Actor. Su valor de retorno es una union con `string`.
        await request.jwtVerify();
        request.actor = { id: request.user.id, role: request.user.role };
    } catch {
        return reply.code(401).send({
            code: 'UNAUTHORIZED',
            message: 'Credenciales ausentes o inválidas.',
        });
    }
}

/**
 * Autenticación opcional: si viene un token válido adjunta el actor, y si no
 * deja pasar igual. La usa GET /listings/:id, donde un visitante anónimo ve el
 * listing filtrado y quien firmó el NDA lo ve completo.
 */
export async function authenticateOptional(request: FastifyRequest): Promise<void> {
    try {
        await request.jwtVerify();
        request.actor = { id: request.user.id, role: request.user.role };
    } catch {
        request.actor = undefined;
    }
}

/** Lee el actor ya verificado. Si falta, es un error de programación de la ruta. */
export function actorOf(request: FastifyRequest): Actor {
    if (!request.actor) {
        throw new Error('Ruta protegida sin preHandler `authenticate`.');
    }
    return request.actor;
}
