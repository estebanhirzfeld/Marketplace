import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SellSteps } from '@/components/SellSteps';
import { AssetTypeCard } from '@/components/AssetTypeCard';

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

describe('SellSteps', () => {
    const html = renderToStaticMarkup(
        <SellSteps labels={['1 · CONECTAR', '2 · COMPLETAR', '3 · PRECIO']} current={1} />,
    );

    it('muestra los pasos en orden', () => {
        expect(texto(html)).toContain('1 · CONECTAR 2 · COMPLETAR 3 · PRECIO');
    });

    it('marca solo el paso actual', () => {
        expect(html.match(/aria-current="step"/g)).toHaveLength(1);
        expect(html).toMatch(/aria-current="step"[^>]*>[^]*2 · COMPLETAR/);
    });
});

describe('AssetTypeCard', () => {
    const logo = <svg aria-label="logo" />;

    it('con href es un enlace con título, descripción y llamada', () => {
        const html = renderToStaticMarkup(
            <AssetTypeCard logo={logo} title="Sitio web" description="Cargás los datos." cta="Cargar sitio →" href="/vender?tipo=web" />,
        );

        expect(html).toContain('href="/vender?tipo=web"');
        expect(texto(html)).toContain('Sitio web Cargás los datos. Cargar sitio →');
    });

    it('con action es un botón de envío', () => {
        const html = renderToStaticMarkup(
            <AssetTypeCard logo={logo} title="Canal de YouTube" description="Conectás tu canal." cta="Conectar YouTube →" action={async () => {}} />,
        );

        expect(html).toContain('<form');
        expect(html).toContain('type="submit"');
        expect(texto(html)).toContain('Conectar YouTube →');
    });
});
