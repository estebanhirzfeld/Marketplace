import { describe, it, expect, vi } from 'vitest';
import { VerifyIdentityUseCase } from '../../../src/use-cases/auth/VerifyIdentityUseCase';
import { GetMyProfileUseCase } from '../../../src/use-cases/auth/GetMyProfileUseCase';
import { IUserRepository } from '../../../src/ports/Repositories';
import { Actor } from '../../../src/ports/Actor';
import { User } from '../../../src/entities/User';
import { Email } from '../../../src/value-objects/Email';
import { UniqueEntityID } from '../../../src/value-objects/UniqueEntityID';
import { InvalidStateError, NotFoundError, ValidationError } from '../../../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

function createMockUserRepo(overrides: Partial<IUserRepository> = {}): IUserRepository {
    return {
        findById: vi.fn().mockResolvedValue(null),
        findByEmail: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

function unUsuario(): User {
    return User.create({
        email: Email.create('nuevo@example.com'),
        fullName: 'Persona Nueva',
        role: UserRole.BUYER,
        passwordHash: 'hash-de-prueba',
    });
}

const ACTOR: Actor = { id: new UniqueEntityID().toString(), role: UserRole.BUYER };

describe('VerifyIdentityUseCase', () => {
    it('verifica y persiste al usuario', async () => {
        const user = unUsuario();
        const repo = createMockUserRepo({ findById: vi.fn().mockResolvedValue(user) });

        const resultado = await new VerifyIdentityUseCase(repo).execute({ dni: '20123456' }, ACTOR);

        expect(resultado.isKycVerified).toBe(true);
        expect(repo.save).toHaveBeenCalledOnce();
    });

    /**
     * La garantía de que nadie verifica la identidad de otro no es un chequeo
     * de permisos: es que el id sale del actor y no del input.
     */
    it('busca por el id del actor, no por uno recibido', async () => {
        const repo = createMockUserRepo({ findById: vi.fn().mockResolvedValue(unUsuario()) });

        await new VerifyIdentityUseCase(repo).execute({ dni: '20123456' }, ACTOR);

        expect(repo.findById).toHaveBeenCalledWith(ACTOR.id);
    });

    it('rechaza un documento inválido sin guardar nada', async () => {
        const repo = createMockUserRepo({ findById: vi.fn().mockResolvedValue(unUsuario()) });

        await expect(new VerifyIdentityUseCase(repo).execute({ dni: 'ABC' }, ACTOR))
            .rejects.toThrow(ValidationError);

        expect(repo.save).not.toHaveBeenCalled();
    });

    it('no deja verificar dos veces', async () => {
        const user = unUsuario();
        user.verifyIdentity({ dni: '20123456' });
        const repo = createMockUserRepo({ findById: vi.fn().mockResolvedValue(user) });

        await expect(new VerifyIdentityUseCase(repo).execute({ dni: '20123456' }, ACTOR))
            .rejects.toThrow(InvalidStateError);
    });

    it('falla si el usuario no existe', async () => {
        await expect(new VerifyIdentityUseCase(createMockUserRepo()).execute({ dni: '20123456' }, ACTOR))
            .rejects.toThrow(NotFoundError);
    });

    it('desbloquea la firma, que era lo que estaba trabado', async () => {
        const user = unUsuario();
        const repo = createMockUserRepo({ findById: vi.fn().mockResolvedValue(user) });

        expect(() => user.assertCanSign()).toThrow();

        await new VerifyIdentityUseCase(repo).execute({ dni: '20123456' }, ACTOR);

        expect(() => user.assertCanSign()).not.toThrow();
    });
});

describe('GetMyProfileUseCase', () => {
    it('devuelve el perfil del actor', async () => {
        const user = unUsuario();
        const repo = createMockUserRepo({ findById: vi.fn().mockResolvedValue(user) });

        const perfil = await new GetMyProfileUseCase(repo).execute(ACTOR);

        expect(perfil.email.getValue()).toBe('nuevo@example.com');
        expect(perfil.isKycVerified).toBe(false);
        expect(repo.findById).toHaveBeenCalledWith(ACTOR.id);
    });

    it('falla si el usuario no existe', async () => {
        await expect(new GetMyProfileUseCase(createMockUserRepo()).execute(ACTOR))
            .rejects.toThrow(NotFoundError);
    });
});
