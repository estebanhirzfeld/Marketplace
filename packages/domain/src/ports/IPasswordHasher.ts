/**
 * Puerto de hashing de contraseñas.
 *
 * El algoritmo (bcrypt, argon2, scrypt) es una decisión de infraestructura y
 * su implementación vive en apps/api. El dominio solo declara qué necesita:
 * convertir una contraseña en un hash y verificar una contra otro.
 *
 * Mantenerlo como puerto permite además que los tests del dominio corran con
 * un doble trivial, sin pagar el costo deliberadamente lento de bcrypt.
 */
export interface IPasswordHasher {
    hash(plain: string): Promise<string>;
    compare(plain: string, hash: string): Promise<boolean>;
}
