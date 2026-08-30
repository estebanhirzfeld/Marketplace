import { describe, it, expect } from 'vitest';
import { Password } from '../src/value-objects/Password';
import { ValidationError } from '../src/errors/DomainError';

describe('Password', () => {
    describe('Política de fortaleza', () => {
        it('rechaza contraseñas de menos de 8 caracteres', () => {
            expect(() => Password.create('Abc123')).toThrow(ValidationError);
        });

        it('rechaza contraseñas sin dígitos', () => {
            expect(() => Password.create('contraseña')).toThrow(ValidationError);
        });

        it('rechaza contraseñas sin letras', () => {
            expect(() => Password.create('12345678')).toThrow(ValidationError);
        });

        it('rechaza una cadena vacía', () => {
            expect(() => Password.create('')).toThrow(ValidationError);
        });

        it('rechaza una cadena de solo espacios', () => {
            expect(() => Password.create('        ')).toThrow(ValidationError);
        });

        it('acepta una contraseña que cumple la política', () => {
            expect(() => Password.create('marketplace1')).not.toThrow();
        });
    });

    describe('Preservación del valor', () => {
        // A diferencia de Email, que normaliza a minúsculas y recorta espacios,
        // en una contraseña cada carácter es significativo. Normalizarla haría
        // que el login fallara contra el hash guardado.
        it('no recorta los espacios de los extremos', () => {
            const password = Password.create('  secreto1  ');
            expect(password.getValue()).toBe('  secreto1  ');
        });

        it('no cambia el casing', () => {
            const password = Password.create('SecretoFuerte1');
            expect(password.getValue()).toBe('SecretoFuerte1');
        });
    });
});
