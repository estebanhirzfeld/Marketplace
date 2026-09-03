import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DemoBanner } from '@/components/DemoBanner';

/**
 * El aviso de entorno de demostración tiene que dejar tres cosas explícitas en
 * cualquier página: que esto es una demo, que la verificación de identidad y de
 * pago está simulada, y que nada de lo que pasa acá tiene efecto legal.
 */
describe('DemoBanner', () => {
    const html = renderToStaticMarkup(<DemoBanner />);

    it('declara que es un entorno de demostración', () => {
        expect(html).toMatch(/demostraci[oó]n/i);
    });

    it('aclara que la verificación de identidad y de pago es simulada', () => {
        expect(html).toMatch(/simulad/i);
        expect(html).toMatch(/identidad/i);
        expect(html).toMatch(/pago/i);
    });

    it('aclara que no tiene efecto legal', () => {
        expect(html).toMatch(/no tienen validez legal/i);
    });

    it('rinde contenido visible (no es un fragmento vacío)', () => {
        expect(html.length).toBeGreaterThan(80);
    });
});
