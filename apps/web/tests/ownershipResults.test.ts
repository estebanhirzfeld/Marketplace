import { describe, it, expect } from 'vitest';
import { findOwnershipResult } from '@/lib/ownershipResults';

describe('findOwnershipResult', () => {
    it('devuelve el resultado de una clave conocida', () => {
        expect(findOwnershipResult('ok')?.ok).toBe(true);
        expect(findOwnershipResult('sin-control')?.ok).toBe(false);
    });

    it('una clave ausente o desconocida no devuelve nada', () => {
        expect(findOwnershipResult(undefined)).toBeUndefined();
        expect(findOwnershipResult('inventada')).toBeUndefined();
    });

    it('las claves heredadas del prototipo no cuentan', () => {
        for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
            expect(findOwnershipResult(key)).toBeUndefined();
        }
    });
});
