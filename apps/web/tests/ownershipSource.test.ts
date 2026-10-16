import { describe, it, expect } from 'vitest';
import { ownershipSourceLabel, oauthOwnershipSource } from '@/lib/ownershipSource';

/** Cómo se nombra la fuente de titularidad en pantalla, y cuál pasa por Google. */

describe('ownershipSourceLabel', () => {
    it('nombra cada fuente como la conoce el vendedor', () => {
        expect(ownershipSourceLabel('youtube')).toBe('YouTube');
        expect(ownershipSourceLabel('adsense')).toBe('AdSense');
        expect(ownershipSourceLabel('dns')).toBe('tu DNS');
    });

    it('una fuente desconocida cae en YouTube, como hasta ahora', () => {
        expect(ownershipSourceLabel('otra')).toBe('YouTube');
    });
});

describe('oauthOwnershipSource', () => {
    it('DNS no pasa por Google: la alternativa con Google es AdSense', () => {
        expect(oauthOwnershipSource('dns')).toBe('adsense');
    });

    it('las fuentes de Google se mantienen', () => {
        expect(oauthOwnershipSource('youtube')).toBe('youtube');
        expect(oauthOwnershipSource('adsense')).toBe('adsense');
    });
});
