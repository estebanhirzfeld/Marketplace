import { IUserRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { User } from '../../entities/User';
import { NotFoundError } from '../../errors/DomainError';

/**
 * El perfil del usuario autenticado.
 *
 * Existe sobre todo por `isKycVerified`: el front necesita saberlo para avisar
 * antes de que la persona choque contra un gate, y ese dato se lee del
 * repositorio y no del token — un JWT emitido antes de la verificación lo
 * traería desactualizado.
 */
export class GetMyProfileUseCase {
    constructor(private readonly userRepo: IUserRepository) {}

    async execute(actor: Actor): Promise<User> {
        const user = await this.userRepo.findById(actor.id);
        if (!user) {
            throw new NotFoundError('Usuario no encontrado');
        }
        return user;
    }
}
