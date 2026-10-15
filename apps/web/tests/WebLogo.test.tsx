import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WebLogo } from '@/components/AssetTypeCard';

describe('WebLogo', () => {
    it('nombra las plataformas para los lectores de pantalla', () => {
        const html = renderToStaticMarkup(<WebLogo />);

        expect(html).toContain('role="img"');
        expect(html).toContain('aria-label="Sitio web: Tiendanube, WooCommerce, WordPress, Shopify u otro"');
    });

    it('muestra cada plataforma con su color, sin caja detrás', () => {
        const html = renderToStaticMarkup(<WebLogo />);

        // Tiendanube va en blanco: su azul marino no se ve sobre el fondo oscuro.
        for (const color of ['#ffffff', '#96588A', '#21759B', '#7AB55C']) {
            expect(html).toContain(`fill="${color}"`);
        }
        expect(html).not.toContain('background-color');
    });

    it('funde solo los extremos de la composición', () => {
        const html = renderToStaticMarkup(<WebLogo />);

        // Una sola máscara, con y sin prefijo, sobre el contenedor.
        expect(html.match(/mask-image:linear-gradient\(to right, transparent 0%/g)).toHaveLength(2);
        expect(html).toContain('black 84%, transparent 100%');
    });
});
