import { describe, it, expect } from 'vitest';
import { DomainName } from '../src/value-objects/DomainName';
import { ValidationError } from '../src/errors/DomainError';

/**
 * El vendedor escribe el dominio como lo tenga a mano: con esquema, con
 * `www.`, con una ruta. La verificación por DNS necesita el nombre pelado,
 * porque es el que se consulta y contra el que se deriva el desafío.
 */

describe('DomainName — normalización', () => {
    it('deja igual un dominio ya limpio', () => {
        expect(DomainName.parse('ejemplo.com').value).toBe('ejemplo.com');
    });

    it('pasa a minúsculas y recorta espacios', () => {
        expect(DomainName.parse('  EJEMPLO.Com ').value).toBe('ejemplo.com');
    });

    it.each([
        ['https://ejemplo.com', 'ejemplo.com'],
        ['http://ejemplo.com', 'ejemplo.com'],
        ['HTTPS://Ejemplo.com/', 'ejemplo.com'],
        ['https://ejemplo.com/ruta/larga?x=1#ancla', 'ejemplo.com'],
        ['ejemplo.com/ruta', 'ejemplo.com'],
        ['ejemplo.com?x=1', 'ejemplo.com'],
        ['ejemplo.com:8080', 'ejemplo.com'],
        ['https://ejemplo.com:8443/ruta', 'ejemplo.com'],
        ['www.ejemplo.com', 'ejemplo.com'],
        ['https://www.ejemplo.com/', 'ejemplo.com'],
        ['ejemplo.com.', 'ejemplo.com'],
    ])('normaliza %s a %s', (entrada, esperado) => {
        expect(DomainName.parse(entrada).value).toBe(esperado);
    });

    it('conserva subdominios distintos de www', () => {
        expect(DomainName.parse('blog.ejemplo.com').value).toBe('blog.ejemplo.com');
    });

    it('acepta TLD compuestos y guiones internos', () => {
        expect(DomainName.parse('mi-sitio.com.ar').value).toBe('mi-sitio.com.ar');
    });

    it.each([
        ['niño.com.ar', 'xn--nio-8ma.com.ar'],
        ['Niño.com.ar', 'xn--nio-8ma.com.ar'],
        ['https://www.Niño.com.ar/ruta', 'xn--nio-8ma.com.ar'],
    ])('convierte el nombre internacionalizado %s a %s', (entrada, esperado) => {
        expect(DomainName.parse(entrada).value).toBe(esperado);
    });

    it('expone el valor también como texto', () => {
        expect(DomainName.parse('ejemplo.com').toString()).toBe('ejemplo.com');
    });

    it('compara por valor', () => {
        expect(DomainName.parse('WWW.Ejemplo.com').equals(DomainName.parse('ejemplo.com'))).toBe(true);
        expect(DomainName.parse('a.com').equals(DomainName.parse('b.com'))).toBe(false);
    });
});

describe('DomainName — entradas inválidas', () => {
    it.each([
        ['vacío', ''],
        ['solo espacios', '   '],
        ['sin TLD', 'localhost'],
        ['solo esquema', 'https://'],
        ['etiqueta vacía', 'ejemplo..com'],
        ['empieza con punto', '.ejemplo.com'],
        ['etiqueta que empieza con guion', '-ejemplo.com'],
        ['etiqueta que termina con guion', 'ejemplo-.com'],
        ['caracteres no permitidos', 'ejem_plo.com'],
        ['espacios en el medio', 'ejem plo.com'],
        ['TLD con guion al final', 'ejemplo.co-'],
        ['dirección IP', '192.168.0.1'],
    ])('rechaza %s', (_, entrada) => {
        expect(() => DomainName.parse(entrada)).toThrow(ValidationError);
    });

    it('rechaza una etiqueta de más de 63 caracteres', () => {
        expect(() => DomainName.parse(`${'a'.repeat(64)}.com`)).toThrow(ValidationError);
        expect(DomainName.parse(`${'a'.repeat(63)}.com`).value).toBe(`${'a'.repeat(63)}.com`);
    });

    it('rechaza un nombre de más de 253 caracteres', () => {
        const largo = `${['a'.repeat(63), 'b'.repeat(63), 'c'.repeat(63), 'd'.repeat(60)].join('.')}.com`;
        expect(largo.length).toBeGreaterThan(253);
        expect(() => DomainName.parse(largo)).toThrow(ValidationError);
    });

    it('rechaza un nombre internacionalizado con caracteres no permitidos', () => {
        expect(() => DomainName.parse('ni ño.com')).toThrow(ValidationError);
    });

    it('orienta con un ejemplo del formato esperado', () => {
        expect(() => DomainName.parse('ejem_plo.com')).toThrow(/ejemplo\.com/);
    });

    it('explica el problema en español', () => {
        expect(() => DomainName.parse('localhost')).toThrow(/dominio/i);
    });
});
