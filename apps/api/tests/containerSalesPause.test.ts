import { describe, it, expect } from 'vitest';
import { pausedAssetTypesFromEnv } from '../src/container';

/** La venta de sitios web está en pausa: la API los rechaza salvo que se habilite a propósito. */
describe('pausedAssetTypesFromEnv', () => {
    it('sin la variable, los sitios web están en pausa', () => {
        expect([...pausedAssetTypesFromEnv({})]).toEqual(['web']);
    });

    it.each(['1', 'true', ' true '])('con WEBSITE_SALES_ENABLED=%s vuelven a venderse', (valor) => {
        expect(pausedAssetTypesFromEnv({ WEBSITE_SALES_ENABLED: valor }).size).toBe(0);
    });

    it('cualquier otro valor la deja en pausa', () => {
        expect([...pausedAssetTypesFromEnv({ WEBSITE_SALES_ENABLED: 'no' })]).toEqual(['web']);
    });
});
