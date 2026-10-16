import { ValidationError } from '../errors/DomainError';

/**
 * Mayor monto, en centavos, que el dominio acepta. Por encima de este entero
 * `number` deja de representar cada centavo y las cuentas serían inexactas.
 */
export const MAX_MONEY_CENTS = Number.MAX_SAFE_INTEGER;

export class Money {
    private constructor(
        private readonly amount: number, // NOTE in smallest unit, e.g. cents if applicable, or keep as float with precise math. Let's use cents to avoid floating point issues.
        private readonly currency: string = 'USD'
    ) {
        if (!Number.isInteger(amount)) {
            throw new ValidationError("El monto debe estar en centavos (entero) para evitar errores de punto flotante.");
        }
        if (Math.abs(amount) > MAX_MONEY_CENTS) {
            throw new ValidationError(`El monto supera el máximo permitido (${MAX_MONEY_CENTS} centavos).`);
        }
    }

    public static fromCents(cents: number, currency: string = 'USD'): Money {
        return new Money(cents, currency);
    }

    public static fromFloat(value: number, currency: string = 'USD'): Money {
        return new Money(Math.round(value * 100), currency);
    }

    public getCents(): number {
        return this.amount;
    }

    public getFloat(): number {
        return this.amount / 100;
    }

    public getCurrency(): string {
        return this.currency;
    }

    public add(other: Money): Money {
        if (this.currency !== other.currency) {
            throw new ValidationError("No se pueden sumar monedas distintas");
        }
        return new Money(this.amount + other.amount, this.currency);
    }

    public subtract(other: Money): Money {
        if (this.currency !== other.currency) throw new ValidationError("Monedas distintas");
        if (other.amount > this.amount) throw new ValidationError("Saldo insuficiente");
        return new Money(this.amount - other.amount, this.currency);
    }

    public multiply(factor: number): Money {
        return new Money(Math.round(this.amount * factor), this.currency);
    }

    public addPercentage(percentage: number): Money {
        return this.add(this.getPercentage(percentage));
    }

    /**
     * Porcentaje redondeado al centavo más cercano (mitades hacia arriba). Con
     * un porcentaje de hasta dos decimales la cuenta es entera (BigInt), porque
     * `monto * 5` ya se sale de los enteros seguros cerca del tope y un `number`
     * redondearía mal.
     */
    public getPercentage(percentage: number): Money {
        const basisPoints = Math.round(percentage * 100);
        if (Math.abs(basisPoints - percentage * 100) > 1e-9) {
            return this.multiply(percentage / 100);
        }
        const numerator = BigInt(this.amount) * BigInt(basisPoints) * 2n + 10000n;
        const denominator = 20000n;
        let quotient = numerator / denominator;
        if (numerator % denominator !== 0n && numerator < 0n) quotient -= 1n; // piso, no truncado
        return new Money(Number(quotient), this.currency);
    }

    public isGreaterThan(other: Money): boolean {
        if (this.currency !== other.currency) throw new ValidationError("Monedas distintas");
        return this.amount > other.amount;
    }

    public equals(other: Money): boolean {
        return this.amount === other.amount && this.currency === other.currency;
    }
}
