import { describe, it, expect, vi } from 'vitest';
import { RegisterUserUseCase } from '../../../src/use-cases/auth/RegisterUserUseCase';
import { LoginUseCase } from '../../../src/use-cases/auth/LoginUseCase';
import { IUserRepository } from '../../../src/ports/Repositories';
import { IPasswordHasher } from '../../../src/ports/IPasswordHasher';
import { User } from '../../../src/entities/User';
import { Email } from '../../../src/value-objects/Email';
import { ValidationError, ForbiddenError } from '../../../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

// ── Mock Factories ───────────────────────────────────────

function createMockUserRepo(overrides: Partial<IUserRepository> = {}): IUserRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findByEmail: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

/**
 * Hasher de prueba. No usa criptografía real: invierte la cadena y le pone un
 * prefijo. Alcanza para verificar la orquestación, y mantiene los tests del
 * dominio sin dependencias de infraestructura ni el costo de bcrypt.
 */
function createFakeHasher(overrides: Partial<IPasswordHasher> = {}): IPasswordHasher {
    return {
        hash: vi.fn(async (plain: string) => `hashed:${plain}`),
        compare: vi.fn(async (plain: string, hash: string) => hash === `hashed:${plain}`),
        ...overrides,
    };
}

function unUsuarioRegistrado(passwordHash = 'hashed:marketplace1'): User {
    return User.create({
        email: Email.create('ana@example.com'),
        fullName: 'Ana Compradora',
        role: UserRole.BUYER,
        passwordHash,
    });
}

// ═════════════════════════════════════════════════════════
// RegisterUserUseCase
// ═════════════════════════════════════════════════════════

describe('RegisterUserUseCase', () => {
    it('registra un usuario nuevo y persiste el hash, nunca el texto plano', async () => {
        const userRepo = createMockUserRepo();
        const hasher = createFakeHasher();
        const useCase = new RegisterUserUseCase(userRepo, hasher);

        const user = await useCase.execute({
            email: 'ana@example.com',
            fullName: 'Ana Compradora',
            password: 'marketplace1',
            role: UserRole.BUYER,
        });

        expect(hasher.hash).toHaveBeenCalledWith('marketplace1');
        expect(userRepo.save).toHaveBeenCalledOnce();

        // Lo que se guarda es lo que devolvió el hasher, nunca el texto plano.
        const { props } = user.toSnapshot();
        expect(props.passwordHash).toBe('hashed:marketplace1');
        expect(user.email.getValue()).toBe('ana@example.com');
    });

    it('arranca sin KYC verificado', async () => {
        const useCase = new RegisterUserUseCase(createMockUserRepo(), createFakeHasher());

        const user = await useCase.execute({
            email: 'ana@example.com',
            fullName: 'Ana Compradora',
            password: 'marketplace1',
            role: UserRole.BUYER,
        });

        expect(user.isKycVerified).toBe(false);
    });

    it('rechaza un email ya registrado', async () => {
        const userRepo = createMockUserRepo({
            findByEmail: vi.fn().mockResolvedValue(unUsuarioRegistrado()),
        });
        const useCase = new RegisterUserUseCase(userRepo, createFakeHasher());

        await expect(useCase.execute({
            email: 'ana@example.com',
            fullName: 'Otra Ana',
            password: 'marketplace1',
            role: UserRole.BUYER,
        })).rejects.toThrow(ValidationError);
    });

    it('rechaza una contraseña que no cumple la política, sin llamar al hasher', async () => {
        const hasher = createFakeHasher();
        const useCase = new RegisterUserUseCase(createMockUserRepo(), hasher);

        await expect(useCase.execute({
            email: 'ana@example.com',
            fullName: 'Ana Compradora',
            password: 'corta',
            role: UserRole.BUYER,
        })).rejects.toThrow(ValidationError);

        expect(hasher.hash).not.toHaveBeenCalled();
    });

    it('rechaza un email con formato inválido', async () => {
        const useCase = new RegisterUserUseCase(createMockUserRepo(), createFakeHasher());

        await expect(useCase.execute({
            email: 'no-es-email',
            fullName: 'Ana Compradora',
            password: 'marketplace1',
            role: UserRole.BUYER,
        })).rejects.toThrow(ValidationError);
    });
});

// ═════════════════════════════════════════════════════════
// LoginUseCase
// ═════════════════════════════════════════════════════════

describe('LoginUseCase', () => {
    it('devuelve el actor cuando las credenciales son correctas', async () => {
        const user = unUsuarioRegistrado();
        const userRepo = createMockUserRepo({
            findByEmail: vi.fn().mockResolvedValue(user),
        });
        const useCase = new LoginUseCase(userRepo, createFakeHasher());

        const actor = await useCase.execute('ana@example.com', 'marketplace1');

        expect(actor.id).toBe(user.id.toString());
        expect(actor.role).toBe(UserRole.BUYER);
    });

    it('rechaza una contraseña incorrecta', async () => {
        const userRepo = createMockUserRepo({
            findByEmail: vi.fn().mockResolvedValue(unUsuarioRegistrado()),
        });
        const useCase = new LoginUseCase(userRepo, createFakeHasher());

        await expect(useCase.execute('ana@example.com', 'otraClave1'))
            .rejects.toThrow(ForbiddenError);
    });

    it('rechaza un email inexistente', async () => {
        const useCase = new LoginUseCase(createMockUserRepo(), createFakeHasher());

        await expect(useCase.execute('nadie@example.com', 'marketplace1'))
            .rejects.toThrow(ForbiddenError);
    });

    // No distinguir entre "no existe" y "clave incorrecta" evita que un atacante
    // enumere qué emails están registrados probando el login.
    it('no revela si el email existe: mismo error en ambos casos', async () => {
        const conUsuario = new LoginUseCase(
            createMockUserRepo({ findByEmail: vi.fn().mockResolvedValue(unUsuarioRegistrado()) }),
            createFakeHasher(),
        );
        const sinUsuario = new LoginUseCase(createMockUserRepo(), createFakeHasher());

        const errorClaveMal = await conUsuario.execute('ana@example.com', 'otraClave1')
            .catch((e: Error) => e.message);
        const errorNoExiste = await sinUsuario.execute('nadie@example.com', 'marketplace1')
            .catch((e: Error) => e.message);

        expect(errorClaveMal).toBe(errorNoExiste);
    });
});
