import { describe, it, expect } from 'vitest';
import { WebStrategy } from '../../src/strategies/WebStrategy';
import { Money } from '../../src/value-objects/Money';

/**
 * La autoridad de dominio la escribía el vendedor y nadie la comprobaba, y
 * sumaba un 10 % a la valuación. Se quitó del sitio entero; si vuelve, será
 * como un valor medido.
 */
describe('WebStrategy sin autoridad de dominio', () => {
    const sitio = () =>
        new WebStrategy({ monthlyRevenueUsd: Money.fromCents(80000, 'USD'), domain: 'ejemplo.com' });

    it('valúa en 30 meses de ingreso, sin bonificaciones', () => {
        expect(sitio().calculateEstimatedPrice().getCents()).toBe(80000 * 30);
    });

    it('no la declara entre sus campos ni sus métricas de resumen', () => {
        const descriptor = sitio().describe();

        expect(descriptor.fields.map((f) => f.key)).not.toContain('domainAuthority');
        expect(descriptor.summaryMetricKeys).not.toContain('domainAuthority');
    });

    it('no la publica ni la serializa', () => {
        expect(sitio().getPublicFields()).not.toContain('domainAuthority');
        expect(sitio().toJSON().assetData).not.toHaveProperty('domainAuthority');
    });
});
