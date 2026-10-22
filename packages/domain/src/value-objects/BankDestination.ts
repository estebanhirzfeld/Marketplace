import { ValidationError } from '../errors/DomainError';
import { Cuit } from './Cuit';

export type BankCurrency = 'ARS' | 'USD';

const CURRENCIES: readonly BankCurrency[] = ['ARS', 'USD'];
/** Letras, números, puntos y guiones, de 6 a 20: la regla de los alias bancarios. */
const ALIAS = /^[A-Za-z0-9.-]{6,20}$/;

/**
 * El dígito verificador de un bloque del CBU, con los pesos del BCRA: la suma
 * ponderada y lo que le falta para el próximo múltiplo de 10.
 */
function checkDigit(digits: string, weights: readonly number[]): number {
    const sum = [...digits].reduce((acc, d, i) => acc + Number(d) * weights[i % weights.length], 0);
    return (10 - (sum % 10)) % 10;
}

/**
 * El CBU tiene dos bloques, cada uno con su verificador al final: los primeros
 * 8 dígitos (banco y sucursal) y los 14 restantes (la cuenta).
 */
function isValidCbu(cbu: string): boolean {
    const first = cbu.slice(0, 8);
    const second = cbu.slice(8);
    return (
        checkDigit(first.slice(0, 7), [7, 1, 3, 9]) === Number(first[7]) &&
        checkDigit(second.slice(0, 13), [3, 9, 7, 1]) === Number(second[13])
    );
}

/**
 * Adónde transferirle a alguien: un CBU o un alias, el titular y la moneda de
 * la cuenta. Un número mal copiado manda la plata a otro lado, así que el CBU
 * se valida con sus dígitos verificadores y no solo por el largo.
 */
export class BankDestination {
    private constructor(
        public readonly holder: string,
        public readonly currency: BankCurrency,
        public readonly cbu?: string,
        public readonly alias?: string,
        /** El CUIT o CUIL del titular: el comprador lo ve en su banco antes de transferir. */
        public readonly holderTaxId?: string,
    ) {}

    public static create(input: {
        cbu?: string;
        alias?: string;
        holder: string;
        holderTaxId?: string;
        currency: string;
    }): BankDestination {
        const cbu = input.cbu?.replace(/\s+/g, '') || undefined;
        const alias = input.alias?.trim() || undefined;
        const holder = input.holder.trim();

        if (!cbu && !alias) throw new ValidationError('Decinos el CBU o el alias de tu cuenta.');
        if (cbu && alias) throw new ValidationError('Decinos el CBU o el alias, no los dos.');
        if (cbu) {
            if (!/^\d{22}$/.test(cbu)) throw new ValidationError('El CBU tiene 22 dígitos.');
            if (!isValidCbu(cbu)) throw new ValidationError('El CBU no es válido: revisá los números.');
        }
        if (alias && !ALIAS.test(alias)) {
            throw new ValidationError('El alias tiene entre 6 y 20 letras, números, puntos o guiones.');
        }
        if (!holder) throw new ValidationError('Decinos el titular de la cuenta.');
        if (!CURRENCIES.includes(input.currency as BankCurrency)) {
            throw new ValidationError('La cuenta es en pesos o en dólares.');
        }

        // Opcional acá: las cuentas declaradas antes de pedirlo se siguen leyendo.
        const holderTaxId = input.holderTaxId?.trim() ? Cuit.create(input.holderTaxId).value : undefined;

        return new BankDestination(holder, input.currency as BankCurrency, cbu, alias, holderTaxId);
    }
}
