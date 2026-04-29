import { describe, it, expect } from 'vitest';
import { Money } from '../src/value-objects/Money';

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
});
