import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssetTypeCard, WebLogo } from '@/components/AssetTypeCard';
import { WEBSITE_SALES_ENABLED, sellableAssetTypes } from '@/lib/assetAvailability';

/*
 * La venta de sitios web está en pausa: la tarjeta se muestra, pero no lleva a
 * ningún lado, y la carga manual ofrece solo los canales.
 */

describe('AssetTypeCard deshabilitada', () => {
    const html = renderToStaticMarkup(
        <AssetTypeCard
            logo={<WebLogo />}
            title="Sitio web"
            description="Habilitaremos la venta de sitios web próximamente."
            cta="Próximamente"
            disabled
        />,
    );

    it('no es un enlace ni un botón, y se anuncia como deshabilitada', () => {
        expect(html).not.toContain('<a ');
        expect(html).not.toContain('<button');
        expect(html).toContain('aria-disabled="true"');
    });

    it('dice que llega próximamente', () => {
        expect(html).toContain('Próximamente');
        expect(html).toContain('Habilitaremos la venta de sitios web próximamente.');
    });
});

describe('AssetTypeCard habilitada', () => {
    it('sigue siendo un enlace', () => {
        const html = renderToStaticMarkup(
            <AssetTypeCard logo={<WebLogo />} title="Sitio web" description="d" cta="Cargar sitio →" href="/vender?tipo=web" />,
        );
        expect(html).toContain('href="/vender?tipo=web"');
        expect(html).not.toContain('aria-disabled');
    });
});

describe('sellableAssetTypes', () => {
    it('con los sitios en pausa, solo se publican canales', () => {
        expect(WEBSITE_SALES_ENABLED).toBe(false);
        expect(sellableAssetTypes()).toEqual(['youtube']);
    });
});
