import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssetMark, WebLogo, WebMark } from '@/components/AssetTypeCard';

describe('WebLogo', () => {
    it('es una ventana de navegador que se nombra como sitio web', () => {
        const html = renderToStaticMarkup(<WebLogo />);

        expect(html).toContain('role="img"');
        expect(html).toContain('aria-label="Sitio web"');
    });

    it('mide lo mismo que el de YouTube', () => {
        const html = renderToStaticMarkup(<WebLogo />);

        expect(html).toContain('width="72" height="52" viewBox="0 0 72 52"');
    });

    it('dibuja la ventana: cuerpo blanco, barra de color con tres puntos y dos renglones', () => {
        const html = renderToStaticMarkup(<WebLogo />);

        expect(html).toContain('fill="#ffffff"');
        expect(html).toContain('fill="#2f6bff"');
        expect(html.match(/<circle /g)).toHaveLength(3);
        expect(html.match(/<rect /g)).toHaveLength(3);
    });

    it('ya no apila las plataformas de sitios detrás', () => {
        const html = renderToStaticMarkup(<WebLogo />);

        for (const color of ['#1D2340', '#96588A', '#21759B', '#7AB55C']) {
            expect(html).not.toContain(color);
        }
        expect(html).not.toContain('mask-image');
        expect(html).not.toMatch(/Tiendanube|WooCommerce|WordPress|Shopify/);
    });
});

describe('WebMark', () => {
    it('conserva la proporción a cualquier tamaño', () => {
        expect(renderToStaticMarkup(<WebMark width={52} />)).toContain('width="52" height="38"');
    });

    it('dentro de una composición que ya se nombra no se anuncia', () => {
        const html = renderToStaticMarkup(<WebMark decorative />);

        expect(html).toContain('aria-hidden="true"');
        expect(html).not.toContain('role="img"');
    });
});

describe('AssetMark', () => {
    it('dibuja la marca de cada tipo de activo, chica', () => {
        expect(renderToStaticMarkup(<AssetMark assetType="youtube" width={22} />)).toContain('aria-label="YouTube"');

        const web = renderToStaticMarkup(<AssetMark assetType="web" width={22} />);
        expect(web).toContain('aria-label="Sitio web"');
        expect(web).toContain('width="22" height="16"');
        expect(web).toContain('fill="#2f6bff"');
        expect(web).not.toMatch(/YouTube/);
    });

    it('un tipo desconocido no dibuja la marca de otro', () => {
        expect(renderToStaticMarkup(<AssetMark assetType="podcast" />)).toBe('');
    });
});
