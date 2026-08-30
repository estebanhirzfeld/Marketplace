import { describe, it, expect } from 'vitest';
import { BcryptPasswordHasher } from '../src/adapters/BcryptPasswordHasher';
import { IPasswordHasher } from '@marketplace/domain/src/ports/IPasswordHasher';

// El adaptador se testea contra el puerto que promete cumplir.
const hasher: IPasswordHasher = new BcryptPasswordHasher();

describe('BcryptPasswordHasher', () => {
    it('nunca devuelve el texto plano', async () => {
        const hash = await hasher.hash('marketplace1');

        expect(hash).not.toBe('marketplace1');
        expect(hash).not.toContain('marketplace1');
    });

    it('acepta la contraseña correcta', async () => {
        const hash = await hasher.hash('marketplace1');
        await expect(hasher.compare('marketplace1', hash)).resolves.toBe(true);
    });

    it('rechaza una contraseña incorrecta', async () => {
        const hash = await hasher.hash('marketplace1');
        await expect(hasher.compare('otraClave1', hash)).resolves.toBe(false);
    });

    // Bcrypt genera un salt aleatorio por llamada. Sin salt, dos usuarios con
    // la misma contraseña compartirían hash y una tabla precomputada los
    // rompería a ambos de una vez.
    it('produce hashes distintos para la misma contraseña', async () => {
        const [a, b] = await Promise.all([
            hasher.hash('marketplace1'),
            hasher.hash('marketplace1'),
        ]);

        expect(a).not.toBe(b);
        await expect(hasher.compare('marketplace1', a)).resolves.toBe(true);
        await expect(hasher.compare('marketplace1', b)).resolves.toBe(true);
    });

    it('rechaza un hash corrupto en vez de aceptarlo', async () => {
        await expect(hasher.compare('marketplace1', 'no-es-un-hash')).resolves.toBe(false);
    });
});
