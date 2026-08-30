import { describe, it, expect } from 'vitest';
import {
    DomainError,
    NotFoundError,
    ForbiddenError,
    InvalidStateError,
    ValidationError,
} from '../../src/errors/DomainError';

describe('Errores de dominio', () => {
    describe('Jerarquía', () => {
        it('todos heredan de DomainError y de Error', () => {
            const errores = [
                new NotFoundError('no encontrado'),
                new ForbiddenError('sin permiso'),
                new InvalidStateError('estado inválido'),
                new ValidationError('dato inválido'),
            ];

            for (const error of errores) {
                expect(error).toBeInstanceOf(DomainError);
                expect(error).toBeInstanceOf(Error);
            }
        });

        it('cada subtipo es distinguible por instanceof', () => {
            const noEncontrado = new NotFoundError('no encontrado');

            expect(noEncontrado).toBeInstanceOf(NotFoundError);
            expect(noEncontrado).not.toBeInstanceOf(ForbiddenError);
            expect(noEncontrado).not.toBeInstanceOf(InvalidStateError);
            expect(noEncontrado).not.toBeInstanceOf(ValidationError);
        });

        it('expone name igual al nombre de la clase', () => {
            expect(new NotFoundError('x').name).toBe('NotFoundError');
            expect(new ForbiddenError('x').name).toBe('ForbiddenError');
            expect(new InvalidStateError('x').name).toBe('InvalidStateError');
            expect(new ValidationError('x').name).toBe('ValidationError');
        });
    });

    describe('Códigos estables', () => {
        it('cada subtipo expone un code propio', () => {
            expect(new NotFoundError('x').code).toBe('NOT_FOUND');
            expect(new ForbiddenError('x').code).toBe('FORBIDDEN');
            expect(new InvalidStateError('x').code).toBe('INVALID_STATE');
            expect(new ValidationError('x').code).toBe('VALIDATION');
        });

        it('los codes son únicos entre subtipos', () => {
            const codes = [
                new NotFoundError('x').code,
                new ForbiddenError('x').code,
                new InvalidStateError('x').code,
                new ValidationError('x').code,
            ];

            expect(new Set(codes).size).toBe(codes.length);
        });
    });

    describe('Mensaje y diagnóstico', () => {
        it('preserva el mensaje recibido', () => {
            const error = new NotFoundError('Activo no encontrado');
            expect(error.message).toBe('Activo no encontrado');
        });

        // Los 29 asserts existentes usan toThrow('mensaje'). Este test protege
        // esa compatibilidad: si el mensaje dejara de propagarse, romperían todos.
        it('es capturable con toThrow por mensaje', () => {
            expect(() => {
                throw new InvalidStateError('Operación no está esperando contrato');
            }).toThrow('Operación no está esperando contrato');
        });

        it('conserva el stack trace', () => {
            const error = new ForbiddenError('sin permiso');
            expect(error.stack).toBeDefined();
            expect(error.stack).toContain('ForbiddenError');
        });
    });
});
