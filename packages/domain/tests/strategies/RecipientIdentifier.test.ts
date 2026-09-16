import { describe, it, expect } from 'vitest';
import { YouTubeStrategy } from '../../src/strategies/YouTubeStrategy';
import { WebStrategy } from '../../src/strategies/WebStrategy';
import { Money } from '../../src/value-objects/Money';
import { ValidationError } from '../../src/errors/DomainError';

/**
 * Dónde quiere recibir el activo el comprador, comprobado por el tipo de activo.
 *
 * Hasta ahora el dato entraba como texto libre: bastaba con que no estuviera
 * vacío. No alcanza, porque no es un campo de notas — es el destino al que la
 * plataforma va a mandar la invitación, y queda copiado en la constancia de
 * entrega de una operación cerrada. Una dirección mal escrita ahí no se puede
 * arreglar después.
 *
 * Pero tampoco es siempre una dirección de correo. Para un canal de YouTube es
 * la cuenta de Google que recibe la invitación y ahí el formato es exigible;
 * para un dominio es el usuario del registrador, que no tiene forma canónica y
 * varía entre proveedores. Por eso la regla vive en cada estrategia y no en un
 * `if` sobre el tipo de activo: es exactamente el conocimiento que el patrón
 * Strategy existe para encapsular.
 */

function youtube() {
    return new YouTubeStrategy({
        monthlyRevenueUsd: Money.fromCents(50000, 'USD'),
        subscribers: 10000,
        isMonetized: true,
    });
}

function web() {
    return new WebStrategy(Money.fromCents(210000, 'USD'), 52, 'ejemplo.com');
}

describe('YouTubeStrategy.normalizeRecipientIdentifier', () => {
    it('acepta una cuenta de Google y la devuelve normalizada', () => {
        expect(youtube().normalizeRecipientIdentifier('  Comprador@Gmail.COM ')).toBe(
            'comprador@gmail.com',
        );
    });

    it('rechaza una dirección sin arroba', () => {
        expect(() => youtube().normalizeRecipientIdentifier('comprador')).toThrow(ValidationError);
    });

    it('rechaza una dirección sin dominio', () => {
        expect(() => youtube().normalizeRecipientIdentifier('comprador@')).toThrow(ValidationError);
    });

    it('rechaza un dominio sin punto', () => {
        expect(() => youtube().normalizeRecipientIdentifier('comprador@gmail')).toThrow(
            ValidationError,
        );
    });

    it('rechaza una cadena vacía', () => {
        expect(() => youtube().normalizeRecipientIdentifier('   ')).toThrow(ValidationError);
    });

    it('el error dice que hace falta una cuenta de Google, no habla de un formato', () => {
        expect(() => youtube().normalizeRecipientIdentifier('pepe')).toThrow(/cuenta de Google/i);
    });
});

describe('WebStrategy.normalizeRecipientIdentifier', () => {
    it('acepta un usuario de registrador, que no es una dirección de correo', () => {
        expect(web().normalizeRecipientIdentifier('  mi-usuario-namecheap  ')).toBe(
            'mi-usuario-namecheap',
        );
    });

    it('acepta también una dirección de correo, porque algunos registradores la usan', () => {
        expect(web().normalizeRecipientIdentifier('yo@midominio.com')).toBe('yo@midominio.com');
    });

    it('no fuerza minúsculas: un usuario de registrador puede distinguirlas', () => {
        expect(web().normalizeRecipientIdentifier('MiUsuario')).toBe('MiUsuario');
    });

    it('rechaza una cadena vacía', () => {
        expect(() => web().normalizeRecipientIdentifier('   ')).toThrow(ValidationError);
    });
});

describe('el límite de longitud es el mismo que acepta la API', () => {
    it('YouTube rechaza un identificador de más de 320 caracteres', () => {
        const larguísimo = `${'a'.repeat(320)}@gmail.com`;

        expect(() => youtube().normalizeRecipientIdentifier(larguísimo)).toThrow(ValidationError);
    });

    it('un sitio web rechaza un identificador de más de 320 caracteres', () => {
        expect(() => web().normalizeRecipientIdentifier('a'.repeat(321))).toThrow(ValidationError);
    });
});
