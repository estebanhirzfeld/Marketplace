import { ValidationError } from '../errors/DomainError';

export class Email {
    private readonly value: string;

    private constructor(value: string) {
        this.value = value;
    }

    public static create(email: string): Email {
        const trimmed = email.trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(trimmed)) {
            throw new ValidationError(`Dirección de email inválida: ${trimmed}`);
        }

        return new Email(trimmed);
    }

    public getValue(): string {
        return this.value;
    }

    public equals(other: Email): boolean {
        return this.value === other.getValue();
    }
}
