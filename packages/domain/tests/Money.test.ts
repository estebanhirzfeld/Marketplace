import { describe, it, expect } from 'vitest';
import { Money } from '../src/value-objects/Money';
import { ValidationError } from '../src/errors/DomainError';

describe('Money Value Object', () => {
    it('should create from cents correctly', () => {
        const m = Money.fromCents(1000);
        expect(m.getCents()).toBe(1000);
        expect(m.getFloat()).toBe(10);
        expect(m.getCurrency()).toBe('USD');
    });

    it('should create from float correctly', () => {
        const m = Money.fromFloat(15.5);
        expect(m.getCents()).toBe(1550);
    });

    it('should add amounts correctly', () => {
        const m1 = Money.fromCents(1000);
        const m2 = Money.fromCents(500);
        const sum = m1.add(m2);
        expect(sum.getCents()).toBe(1500);
    });

    it('should calculate percentage correctly', () => {
        const price = Money.fromCents(10000); // 100 USD
        const commission = price.getPercentage(10);
        expect(commission.getCents()).toBe(1000); // 10 USD
    });

    describe('montos grandes', () => {
        it('acepta el mayor entero seguro', () => {
            expect(Money.fromCents(Number.MAX_SAFE_INTEGER, 'ARS').getCents()).toBe(Number.MAX_SAFE_INTEGER);
        });

        it('rechaza un monto mayor a Number.MAX_SAFE_INTEGER', () => {
            expect(() => Money.fromCents(Number.MAX_SAFE_INTEGER + 1)).toThrow(ValidationError);
            expect(() => Money.fromCents(Number.MAX_SAFE_INTEGER + 1)).toThrow(/supera el máximo/);
        });

        it('rechaza un monto negativo fuera del rango seguro', () => {
            expect(() => Money.fromCents(-Number.MAX_SAFE_INTEGER - 1)).toThrow(ValidationError);
        });

        it('rechaza el resultado de una operación que se pasa del tope', () => {
            const casiTope = Money.fromCents(Number.MAX_SAFE_INTEGER - 1);
            expect(() => casiTope.add(Money.fromCents(2))).toThrow(ValidationError);
            expect(() => casiTope.multiply(2)).toThrow(ValidationError);
        });

        it('calcula la comisión del 5% exacta con 4555555497 centavos', () => {
            const price = Money.fromCents(4_555_555_497, 'ARS');
            // 227777774,85 -> 227777775
            expect(price.getPercentage(5).getCents()).toBe(227_777_775);
            expect(price.addPercentage(5).getCents()).toBe(4_783_333_272);
        });

        it('calcula la comisión del 5% exacta cerca del tope seguro', () => {
            const price = Money.fromCents(9_000_000_000_000_010, 'ARS');
            expect(price.getPercentage(5).getCents()).toBe(450_000_000_000_001);
        });
    });
});
