import bcrypt from 'bcryptjs';
import { IPasswordHasher } from '@marketplace/domain/src/ports/IPasswordHasher';

/**
 * Implementación de IPasswordHasher con bcrypt.
 *
 * Vive en apps/api, no en el dominio: el algoritmo de hashing es una decisión
 * de infraestructura y puede cambiarse por argon2 sin tocar una sola regla de
 * negocio. El dominio solo conoce el puerto.
 *
 * Se usa `bcryptjs` (JavaScript puro) en lugar de `bcrypt` (binding nativo)
 * para evitar compilación de binarios en el monorepo. El costo es que es más
 * lento, lo cual en un hasher no es un defecto.
 */
export class BcryptPasswordHasher implements IPasswordHasher {
    /**
     * 12 rondas: cada +1 duplica el trabajo. Es el punto de equilibrio
     * habitual entre resistencia a fuerza bruta y latencia aceptable de login.
     */
    private static readonly SALT_ROUNDS = 12;

    async hash(plain: string): Promise<string> {
        return bcrypt.hash(plain, BcryptPasswordHasher.SALT_ROUNDS);
    }

    async compare(plain: string, hash: string): Promise<boolean> {
        return bcrypt.compare(plain, hash);
    }
}
