import { ValidationError } from '../errors/DomainError';

/**
 * Contraseña en texto plano, ya validada contra la política de fortaleza.
 *
 * El dominio valida la política pero NO hashea: el algoritmo de hashing es
 * infraestructura y vive detrás del puerto `IPasswordHasher`. Así el dominio
 * no depende de bcrypt ni de ninguna librería de criptografía.
 *
 * Existe para que una contraseña débil no pueda llegar nunca al hasher: si
 * tenés una instancia de Password, ya cumple la política.
 */
export class Password {
    private static readonly MIN_LENGTH = 8;

    private constructor(private readonly value: string) {}

    public static create(plain: string): Password {
        if (plain.trim() === '') {
            throw new ValidationError('La contraseña no puede estar vacía.');
        }

        if (plain.length < Password.MIN_LENGTH) {
            throw new ValidationError(
                `La contraseña debe tener al menos ${Password.MIN_LENGTH} caracteres.`
            );
        }

        if (!/[a-zA-Z]/.test(plain)) {
            throw new ValidationError('La contraseña debe incluir al menos una letra.');
        }

        if (!/[0-9]/.test(plain)) {
            throw new ValidationError('La contraseña debe incluir al menos un número.');
        }

        // Sin trim ni toLowerCase, a diferencia de Email: en una contraseña
        // cada carácter es significativo y normalizarla rompería el login.
        return new Password(plain);
    }

    public getValue(): string {
        return this.value;
    }
}
