import { describe, it, expect } from 'vitest';
import {
    isSearchIndexingEnabled,
    robotsRules,
    robotsMetadata,
} from '@/lib/indexing';

/**
 * El indexado por buscadores es un interruptor reversible por configuración:
 * una sola variable de entorno, `SEARCH_INDEXING`, que por decisión del usuario
 * arranca en "indexable" y se apaga sin tocar código.
 */
describe('isSearchIndexingEnabled', () => {
    it('sin la variable, el sitio es indexable (default)', () => {
        expect(isSearchIndexingEnabled(undefined)).toBe(true);
    });

    it('con SEARCH_INDEXING="false" el indexado se apaga', () => {
        expect(isSearchIndexingEnabled('false')).toBe(false);
    });

    it('con SEARCH_INDEXING="true" el indexado sigue activo', () => {
        expect(isSearchIndexingEnabled('true')).toBe(true);
    });

    it('acepta otras formas negativas: "0", "off", "no" (case/espacios)', () => {
        expect(isSearchIndexingEnabled('0')).toBe(false);
        expect(isSearchIndexingEnabled('  OFF ')).toBe(false);
        expect(isSearchIndexingEnabled('No')).toBe(false);
    });

    it('cualquier otro valor deja el sitio indexable', () => {
        expect(isSearchIndexingEnabled('1')).toBe(true);
        expect(isSearchIndexingEnabled('yes')).toBe(true);
        expect(isSearchIndexingEnabled('')).toBe(true);
    });
});

describe('robotsRules', () => {
    it('habilitado: permite todo el sitio', () => {
        expect(robotsRules(true)).toEqual({ userAgent: '*', allow: '/' });
    });

    it('deshabilitado: prohíbe todo el sitio', () => {
        expect(robotsRules(false)).toEqual({ userAgent: '*', disallow: '/' });
    });
});

describe('robotsMetadata', () => {
    it('habilitado: index y follow verdaderos', () => {
        expect(robotsMetadata(true)).toEqual({ index: true, follow: true });
    });

    it('deshabilitado: index y follow falsos', () => {
        expect(robotsMetadata(false)).toEqual({ index: false, follow: false });
    });
});
