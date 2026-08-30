import { ValidationError } from '../errors/DomainError';

export class Money {
    private constructor(
        private readonly amount: number, // NOTE in smallest unit, e.g. cents if applicable, or keep as float with precise math. Let's use cents to avoid floating point issues.
        private readonly currency: string = 'USD'
    ) {
        if (!Number.isInteger(amount)) {
            throw new ValidationError("El monto debe estar en centavos (entero) para evitar errores de punto flotante.");
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
        return this.multiply(1 + (percentage / 100));
    }

    public getPercentage(percentage: number): Money {
        return this.multiply(percentage / 100);
    }

    public isGreaterThan(other: Money): boolean {
        if (this.currency !== other.currency) throw new ValidationError("Monedas distintas");
        return this.amount > other.amount;
    }

    public equals(other: Money): boolean {
        return this.amount === other.amount && this.currency === other.currency;
    }
}
