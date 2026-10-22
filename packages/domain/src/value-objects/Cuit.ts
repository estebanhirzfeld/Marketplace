import { ValidationError } from '../errors/DomainError';

const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

/** El verificador de un CUIT o CUIL: módulo 11 sobre los primeros 10 dígitos. */
function checkDigit(first10: string): number {
    const sum = [...first10].reduce((acc, d, i) => acc + Number(d) * WEIGHTS[i], 0);
    const rest = 11 - (sum % 11);
    return rest === 11 ? 0 : rest;
}

/**
 * Un CUIT o CUIL: prefijo, el DNI de 8 dígitos y un verificador. Que contenga
 * el DNI es lo que permite comprobar, sin pedir otro dato, que una cuenta
 * bancaria está a nombre de quien verificó su identidad.
 */
export class Cuit {
    private constructor(public readonly value: string) {}

    public static create(raw: string): Cuit {
        const digits = raw.replace(/[\s.-]/g, '');
        if (!/^\d{11}$/.test(digits)) throw new ValidationError('El CUIT o CUIL tiene 11 dígitos.');
        // Un resto de 10 no tiene verificador posible con ese prefijo: no es un CUIT válido.
        const expected = checkDigit(digits.slice(0, 10));
        if (expected === 10 || expected !== Number(digits[10])) {
            throw new ValidationError('El CUIT o CUIL no es válido: revisá los números.');
        }
        return new Cuit(digits);
    }

    /** El CUIT que corresponde a un prefijo y un DNI. Con resto 10 no existe: AFIP cambia el prefijo. */
    public static compose(prefix: string, dni: string): string {
        const first10 = `${prefix}${dni.replace(/\D/g, '').padStart(8, '0')}`;
        const digit = checkDigit(first10);
        if (digit === 10) throw new ValidationError('Con ese prefijo no hay un CUIT posible para ese DNI.');
        return `${first10}${digit}`;
    }

    /** Si es el de esa persona: el DNI va en el medio. Si el DNI se guardó como CUIT, se toma el suyo. */
    public belongsTo(dni: string): boolean {
        const digits = dni.replace(/\D/g, '');
        const document = digits.length === 11 ? digits.slice(2, 10) : digits.padStart(8, '0');
        return this.value.slice(2, 10) === document;
    }
}
