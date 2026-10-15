import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WebLogo } from '@/components/AssetTypeCard';

describe('WebLogo', () => {
    it('nombra las plataformas para los lectores de pantalla', () => {
        const html = renderToStaticMarkup(<WebLogo />);

        expect(html).toContain('role="img"');
        expect(html).toContain('aria-label="Sitio web: WordPress, Shopify, Blogger, Wix u otro"');
    });

    it('muestra el globo y las cuatro plataformas con su color de marca', () => {
        const html = renderToStaticMarkup(<WebLogo />);

        for (const color of ['#FF5722', '#21759B', '#7AB55C', '#0C6EFC']) {
            expect(html).toContain(`background-color:${color}`);
        }
        expect(html).toContain('bg-[#1f3a5f]');
    });

    it('funde cada plataforma hacia su borde exterior', () => {
        const html = renderToStaticMarkup(<WebLogo />);

        // Dos plataformas por lado, y cada una lleva la máscara con y sin prefijo.
        expect(html.match(/linear-gradient\(to right/g)).toHaveLength(4);
        expect(html.match(/linear-gradient\(to left/g)).toHaveLength(4);
    });
});
