import { IUserRepository } from '../../ports/Repositories';
import { Actor } from '../../ports/Actor';
import { User } from '../../entities/User';
import { NotFoundError } from '../../errors/DomainError';

export interface VerifyIdentityInput {
    dni: string;
    phone?: string;
    country?: string;
}

/**
 * Verificación de identidad del propio usuario.
 *
 * No hay chequeo de permisos porque no hay nada que chequear: se opera sobre
 * el id del actor, así que nadie puede verificar la identidad de otro.
 */
export class VerifyIdentityUseCase {
    constructor(private readonly userRepo: IUserRepository) {}

    async execute(input: VerifyIdentityInput, actor: Actor): Promise<User> {
        const user = await this.userRepo.findById(actor.id);
        if (!user) {
            throw new NotFoundError('Usuario no encontrado');
        }

        // La entidad valida la forma del documento y lanza si ya está verificada.
        user.verifyIdentity(input);

        await this.userRepo.save(user);
        return user;
    }
}
