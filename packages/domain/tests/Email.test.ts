import { describe, it, expect } from 'vitest';
import { Email } from '../src/value-objects/Email';
import { ValidationError } from '../src/errors/DomainError';

/*
 * Qué acepta y qué rechaza la dirección de correo.
 *
 * Hasta ahora este value object no tenía pruebas propias: su única cobertura
 * era indirecta, a través del registro de un usuario. Eso alcanzaba mientras
 * el único camino que lo usaba era ese, pero deja de alcanzar cuando se lo
 * empieza a usar para validar la cuenta donde el comprador quiere recibir un
 * canal de YouTube, que es un dato que viaja hasta la constancia de entrega de
 * una operación cerrada.
 *
 * Los últimos tres casos fijan permisividades conocidas del patrón actual. No
 * son aspiraciones: describen lo que hoy pasa, para que si alguien endurece la
 * validación se entere de que las está cambiando a propósito.
 */

describe('Email.create', () => {
    it('acepta una dirección corriente y la devuelve tal cual', () => {
        const email = Email.create('ana@gmail.com');

        expect(email.getValue()).toBe('ana@gmail.com');
    });

    it('normaliza a minúsculas y recorta los espacios de los extremos', () => {
        const email = Email.create('  Ana.Perez@Gmail.COM  ');

        expect(email.getValue()).toBe('ana.perez@gmail.com');
    });

    it('rechaza una cadena vacía', () => {
        expect(() => Email.create('')).toThrow(ValidationError);
    });

    it('rechaza una cadena que es solo espacios', () => {
        expect(() => Email.create('   ')).toThrow(ValidationError);
    });

    it('rechaza una dirección sin arroba', () => {
        expect(() => Email.create('anagmail.com')).toThrow(ValidationError);
    });

    it('rechaza una dirección sin nada antes de la arroba', () => {
        expect(() => Email.create('@gmail.com')).toThrow(ValidationError);
    });

    it('rechaza una dirección sin nada después de la arroba', () => {
        expect(() => Email.create('ana@')).toThrow(ValidationError);
    });

    it('rechaza un dominio sin punto', () => {
        expect(() => Email.create('ana@gmail')).toThrow(ValidationError);
    });

    it('rechaza una dirección con espacios en el medio', () => {
        expect(() => Email.create('an a@gmail.com')).toThrow(ValidationError);
    });

    it('rechaza dos arrobas', () => {
        expect(() => Email.create('ana@otra@gmail.com')).toThrow(ValidationError);
    });

    it('el mensaje de error nombra la dirección rechazada', () => {
        expect(() => Email.create('pepe@')).toThrow('Dirección de email inválida: pepe@');
    });

    it('dos direcciones que solo difieren en mayúsculas son iguales', () => {
        const una = Email.create('ana@gmail.com');
        const otra = Email.create('ANA@GMAIL.COM');

        expect(una.equals(otra)).toBe(true);
    });

    it('permisividad conocida: acepta puntos consecutivos en el dominio', () => {
        expect(Email.create('ana@gmail..com').getValue()).toBe('ana@gmail..com');
    });

    it('permisividad conocida: acepta un dominio terminado en punto', () => {
        // El patrón hace backtracking: `gmail` satisface el primer tramo, el
        // punto literal casa con el segundo punto, y `com.` satisface el
        // último `[^\s@]+` porque no contiene espacios ni arrobas.
        expect(Email.create('ana@gmail.com.').getValue()).toBe('ana@gmail.com.');
    });

    it('permisividad conocida: acepta un dominio de una sola letra', () => {
        expect(Email.create('a@b.c').getValue()).toBe('a@b.c');
    });

    it('permisividad conocida: no impone el límite de 320 caracteres de la RFC 5321', () => {
        const larguísima = `${'a'.repeat(400)}@gmail.com`;

        expect(Email.create(larguísima).getValue()).toHaveLength(410);
    });
});
