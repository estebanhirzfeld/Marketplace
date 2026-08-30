import { describe, it, expect } from 'vitest';
import { User } from '../src/entities/User';
import { Email } from '../src/value-objects/Email';
import { InvalidStateError, ValidationError } from '../src/errors/DomainError';
import { UserRole } from '@marketplace/shared-types';

/**
 * Verificación de identidad.
 *
 * `verifyKyc()` ya exigía DNI y nombre completo, pero nadie podía presentar
 * el DNI: al registrarse solo se pide email, nombre y contraseña. El resultado
 * era que todo usuario nuevo quedaba bloqueado para publicar y para firmar,
 * sin ninguna forma de destrabarse.
 */

function unUsuarioNuevo(): User {
    return User.create({
        email: Email.create('nuevo@example.com'),
        fullName: 'Persona Nueva',
        role: UserRole.BUYER,
        passwordHash: 'hash-de-prueba',
    });
}

describe('User.verificarIdentidad', () => {
    it('un usuario recién registrado no está verificado', () => {
        expect(unUsuarioNuevo().isKycVerified).toBe(false);
    });

    it('presentar el documento lo deja verificado', () => {
        const user = unUsuarioNuevo();

        user.verificarIdentidad({ dni: '20123456', country: 'AR' });

        expect(user.isKycVerified).toBe(true);
    });

    it('acepta un documento con puntos y guiones', () => {
        const user = unUsuarioNuevo();

        user.verificarIdentidad({ dni: '20.123.456' });

        expect(user.isKycVerified).toBe(true);
    });

    it('rechaza un documento vacío', () => {
        expect(() => unUsuarioNuevo().verificarIdentidad({ dni: '   ' }))
            .toThrow(ValidationError);
    });

    it('rechaza un documento con letras', () => {
        expect(() => unUsuarioNuevo().verificarIdentidad({ dni: 'ABC12345' }))
            .toThrow(ValidationError);
    });

    it('rechaza un documento demasiado corto', () => {
        expect(() => unUsuarioNuevo().verificarIdentidad({ dni: '123' }))
            .toThrow(ValidationError);
    });

    it('no deja verificar dos veces', () => {
        const user = unUsuarioNuevo();
        user.verificarIdentidad({ dni: '20123456' });

        expect(() => user.verificarIdentidad({ dni: '20123456' }))
            .toThrow(InvalidStateError);
    });

    it('un usuario verificado ya puede firmar', () => {
        const user = unUsuarioNuevo();

        expect(() => user.assertCanSign()).toThrow();

        user.verificarIdentidad({ dni: '20123456' });

        expect(() => user.assertCanSign()).not.toThrow();
    });

    it('guarda el teléfono y el país cuando se los pasan', () => {
        const user = unUsuarioNuevo();
        user.verificarIdentidad({ dni: '20123456', phone: '+541155550000', country: 'AR' });

        const { props } = user.toSnapshot();
        expect(props.dni).toBe('20123456');
        expect(props.phone).toBe('+541155550000');
        expect(props.country).toBe('AR');
    });
});
