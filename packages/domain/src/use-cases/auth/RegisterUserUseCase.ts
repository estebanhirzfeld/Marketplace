import { IUserRepository } from '../../ports/Repositories';
import { IPasswordHasher } from '../../ports/IPasswordHasher';
import { User } from '../../entities/User';
import { Email } from '../../value-objects/Email';
import { Password } from '../../value-objects/Password';
import { ValidationError } from '../../errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

export interface RegisterUserInput {
    email: string;
    fullName: string;
    password: string;
    role: UserRole;
    phone?: string;
    country?: string;
    dni?: string;
}

export class RegisterUserUseCase {
    constructor(
        private readonly userRepo: IUserRepository,
        private readonly hasher: IPasswordHasher,
    ) {}

    async execute(input: RegisterUserInput): Promise<User> {
        // 1. Validar formato y política antes de tocar la base o el hasher.
        //    Los value objects lanzan si algo no cumple.
        const email = Email.create(input.email);
        const password = Password.create(input.password);

        // 2. El email identifica al usuario: no puede repetirse.
        const existente = await this.userRepo.findByEmail(email.getValue());
        if (existente) {
            throw new ValidationError('Ya existe un usuario con ese email.');
        }

        // 3. Hashear es infraestructura — el dominio solo pide el resultado.
        const passwordHash = await this.hasher.hash(password.getValue());

        // 4. Crear (arranca sin KYC verificado) y persistir.
        const user = User.create({
            email,
            fullName: input.fullName,
            role: input.role,
            phone: input.phone,
            country: input.country,
            dni: input.dni,
            passwordHash,
        });

        await this.userRepo.save(user);

        return user;
    }
}
