import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { AesGcmSecretCipher } from '../src/adapters/AesGcmSecretCipher';

/** Una clave válida: 32 bytes en base64. */
function clave(): string {
    return randomBytes(32).toString('base64');
}

describe('AesGcmSecretCipher — ida y vuelta', () => {
    it('descifra lo que cifró', () => {
        const cipher = new AesGcmSecretCipher(clave());

        expect(cipher.decrypt(cipher.encrypt('APP_USR-1234-secreto'))).toBe('APP_USR-1234-secreto');
    });

    it('soporta texto vacío y caracteres no ASCII', () => {
        const cipher = new AesGcmSecretCipher(clave());

        expect(cipher.decrypt(cipher.encrypt(''))).toBe('');
        expect(cipher.decrypt(cipher.encrypt('contraseña ñ ✓ 日本'))).toBe('contraseña ñ ✓ 日本');
    });

    it('el mismo texto da un cifrado distinto cada vez (IV aleatorio)', () => {
        const cipher = new AesGcmSecretCipher(clave());

        const a = cipher.encrypt('mismo texto');
        const b = cipher.encrypt('mismo texto');

        expect(a).not.toBe(b);
        expect(cipher.decrypt(a)).toBe('mismo texto');
        expect(cipher.decrypt(b)).toBe('mismo texto');
    });

    it('el resultado lleva el prefijo de versión y no contiene el texto plano', () => {
        const cipher = new AesGcmSecretCipher(clave());

        const payload = cipher.encrypt('texto-en-claro-reconocible');

        expect(payload.startsWith('v1:')).toBe(true);
        expect(payload).not.toContain('texto-en-claro-reconocible');
    });

    it('el contenido es IV de 12 bytes, etiqueta de 16 y el texto cifrado', () => {
        const cipher = new AesGcmSecretCipher(clave());

        const bytes = Buffer.from(cipher.encrypt('abcde').slice(3), 'base64');

        expect(bytes.length).toBe(12 + 16 + 5);
    });
});

describe('AesGcmSecretCipher — rechazos', () => {
    it('rechaza un payload alterado', () => {
        const cipher = new AesGcmSecretCipher(clave());
        const bytes = Buffer.from(cipher.encrypt('secreto').slice(3), 'base64');
        bytes[bytes.length - 1] ^= 0x01;

        expect(() => cipher.decrypt(`v1:${bytes.toString('base64')}`)).toThrow(/descifrar/);
    });

    it('rechaza una etiqueta de autenticación alterada', () => {
        const cipher = new AesGcmSecretCipher(clave());
        const bytes = Buffer.from(cipher.encrypt('secreto').slice(3), 'base64');
        bytes[12] ^= 0x01;

        expect(() => cipher.decrypt(`v1:${bytes.toString('base64')}`)).toThrow(/descifrar/);
    });

    it('rechaza un payload cifrado con otra clave', () => {
        const payload = new AesGcmSecretCipher(clave()).encrypt('secreto');

        expect(() => new AesGcmSecretCipher(clave()).decrypt(payload)).toThrow(/descifrar/);
    });

    it('rechaza un prefijo de versión desconocido', () => {
        const cipher = new AesGcmSecretCipher(clave());
        const payload = cipher.encrypt('secreto');

        expect(() => cipher.decrypt(payload.replace('v1:', 'v2:'))).toThrow(/versión/);
        expect(() => cipher.decrypt('texto-sin-prefijo')).toThrow(/versión/);
    });

    it('rechaza un payload demasiado corto', () => {
        const cipher = new AesGcmSecretCipher(clave());

        expect(() => cipher.decrypt('v1:' + Buffer.alloc(10).toString('base64'))).toThrow(/descifrar/);
    });

    it('el error de descifrado no filtra la clave ni el texto', () => {
        const k = clave();
        const payload = new AesGcmSecretCipher(clave()).encrypt('secreto-reconocible');

        try {
            new AesGcmSecretCipher(k).decrypt(payload);
            throw new Error('debía lanzar');
        } catch (e) {
            const mensaje = (e as Error).message;
            expect(mensaje).not.toContain(k);
            expect(mensaje).not.toContain('secreto-reconocible');
        }
    });
});

describe('AesGcmSecretCipher — clave', () => {
    it('rechaza una clave que no decodifica a 32 bytes', () => {
        const corta = randomBytes(16).toString('base64');
        const larga = randomBytes(48).toString('base64');

        expect(() => new AesGcmSecretCipher(corta)).toThrow(/32 bytes/);
        expect(() => new AesGcmSecretCipher(larga)).toThrow(/32 bytes/);
        expect(() => new AesGcmSecretCipher('')).toThrow(/32 bytes/);
    });

    it('el error de clave inválida no la revela', () => {
        const corta = randomBytes(16).toString('base64');

        try {
            new AesGcmSecretCipher(corta);
            throw new Error('debía lanzar');
        } catch (e) {
            expect((e as Error).message).not.toContain(corta);
        }
    });
});
