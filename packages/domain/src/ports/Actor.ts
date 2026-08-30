import { UserRole } from '@marketplace/shared-types';
import { ForbiddenError } from '../errors/DomainError';

/**
 * Quién ejecuta un use case.
 *
 * La autenticación (verificar el JWT, resolver la sesión) es responsabilidad de
 * la capa HTTP. La autorización — si este actor puede hacer esta acción sobre
 * este recurso — es regla de negocio y por eso el Actor entra al dominio.
 *
 * `role` solo distingue a los admins. Ser buyer o seller no es un atributo de
 * la persona sino su posición en una relación concreta: sos el seller de ESE
 * listing, o el buyer de ESA operación. Esas reglas se resuelven por pertenencia
 * contra la entidad, no mirando este campo.
 */
export interface Actor {
    id: string;
    role: UserRole;
}

/**
 * Único chequeo de rol real del sistema. Los 5 pasos de plataforma —aprobar y
 * rechazar listings, confirmar custodia, confirmar pago y completar— no tienen
 * una relación de pertenencia contra la que validar, así que son los únicos
 * que se autorizan por rol.
 */
export function assertIsAdmin(actor: Actor): void {
    if (actor.role !== UserRole.ADMIN) {
        throw new ForbiddenError('Esta acción es exclusiva de un administrador.');
    }
}
