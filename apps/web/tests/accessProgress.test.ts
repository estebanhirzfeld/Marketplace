import { describe, it, expect } from 'vitest';
import { readBrandAccountDone, writeBrandAccountDone, type KeyValueStorage } from '@/lib/accessProgress';

function memory(): KeyValueStorage & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return {
        data,
        getItem: (k) => data.get(k) ?? null,
        setItem: (k, v) => void data.set(k, v),
    };
}

describe('accessProgress', () => {
    it('recuerda el paso 1 por activo', () => {
        const s = memory();
        expect(readBrandAccountDone(s, 'a')).toBe(false);
        writeBrandAccountDone(s, 'a');
        expect(readBrandAccountDone(s, 'a')).toBe(true);
        expect(readBrandAccountDone(s, 'b')).toBe(false);
    });

    it('sin almacenamiento no falla: simplemente no recuerda', () => {
        expect(readBrandAccountDone(null, 'a')).toBe(false);
        expect(() => writeBrandAccountDone(null, 'a')).not.toThrow();
    });

    it('si el almacenamiento lanza, tampoco falla', () => {
        const roto: KeyValueStorage = {
            getItem: () => {
                throw new Error('bloqueado');
            },
            setItem: () => {
                throw new Error('bloqueado');
            },
        };
        expect(readBrandAccountDone(roto, 'a')).toBe(false);
        expect(() => writeBrandAccountDone(roto, 'a')).not.toThrow();
    });
});
