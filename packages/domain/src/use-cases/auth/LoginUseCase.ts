import { IUserRepository } from '../../ports/Repositories';
import { IPasswordHasher } from '../../ports/IPasswordHasher';
import { Actor } from '../../ports/Actor';
import { ForbiddenError } from '../../errors/DomainError';

/**
 * Mismo mensaje para "el email no existe" y "la contraseña es incorrecta".
 * Distinguirlos le permitiría a un atacante enumerar qué emails están
 * registrados probando el login uno por uno.
 */
const CREDENCIALES_INVALIDAS = 'Email o contraseña incorrectos.';

export class LoginUseCase {
    constructor(
        private readonly userRepo: IUserRepository,
        private readonly hasher: IPasswordHasher,
    ) {}

    /**
     * Devuelve el Actor, no un token. Emitir y firmar un JWT es detalle de la
     * capa HTTP: el dominio solo responde quién es este usuario.
     */
    async execute(email: string, password: string): Promise<Actor> {
        const user = await this.userRepo.findByEmail(email.trim().toLowerCase());
        if (!user) {
            throw new ForbiddenError(CREDENCIALES_INVALIDAS);
        }

        const coincide = await this.hasher.compare(password, user.passwordHash);
        if (!coincide) {
            throw new ForbiddenError(CREDENCIALES_INVALIDAS);
        }

        return { id: user.id.toString(), role: user.role };
    }
}
