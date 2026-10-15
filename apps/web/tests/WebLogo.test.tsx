import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WebLogo } from '@/components/AssetTypeCard';

describe('WebLogo', () => {
    it('nombra las plataformas para los lectores de pantalla', () => {
        const html = renderToStaticMarkup(<WebLogo />);

        expect(html).toContain('role="img"');
        expect(html).toContain('aria-label="Sitio web: Tiendanube, WooCommerce, WordPress, Shopify u otro"');
    });

    it('pone al frente un mosaico del mismo tamaño que el de YouTube', () => {
        const html = renderToStaticMarkup(<WebLogo />);

        expect(html).toContain('width="72" height="52" viewBox="0 0 72 52"');
    });

    it('apila detrás cada plataforma como mosaico de su color de marca', () => {
        const html = renderToStaticMarkup(<WebLogo />);

        for (const color of ['#1D2340', '#96588A', '#21759B', '#7AB55C']) {
            expect(html).toContain(`background-color:${color}`);
        }
    });

    it('funde solo los extremos de la composición', () => {
        const html = renderToStaticMarkup(<WebLogo />);

        // Una sola máscara, con y sin prefijo, sobre el contenedor.
        expect(html.match(/mask-image:linear-gradient\(to right/g)).toHaveLength(2);
    });
});
