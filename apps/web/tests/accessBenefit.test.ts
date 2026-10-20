import { describe, it, expect } from 'vitest';
import { accessBenefit } from '@/components/AccessPanel';

describe('accessBenefit', () => {
    it('un canal cuenta los días que informa su tipo de activo', () => {
        expect(accessBenefit('canal', 7)).toBe(
            '7 días después de invitarnos tu canal gana más visibilidad en el mercado.',
        );
    });

    it('un sitio, sin espera, no promete días ni nombra un canal', () => {
        const t = accessBenefit('sitio', 0);

        expect(t).toBe('Con acceso, el traspaso es inmediato y tu sitio gana más visibilidad en el mercado.');
        expect(t).not.toMatch(/días|canal/);
    });
});
