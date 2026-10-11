import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { YouTubeListingFormView } from '@/components/YouTubeListingForm';

/**
 * Lo único que el vendedor completa de un canal conectado es lo que Google no
 * sabe. Los tests fijan que el formulario no vuelva a pedir lo que ya se leyó,
 * que muestre la valuación contra la que fija su precio y que un error traiga
 * su salida.
 */

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

function vista(props: Partial<React.ComponentProps<typeof YouTubeListingFormView>> = {}) {
    return renderToStaticMarkup(
        <YouTubeListingFormView
            state={{}}
            pending={false}
            submit={() => {}}
            estimated={null}
            currency="USD"
            onCurrencyChange={() => {}}
            price=""
            onPriceChange={() => {}}
            niche="other"
            onNicheChange={() => {}}
            noFace={false}
            onNoFaceChange={() => {}}
            {...props}
        />,
    );
}

describe('YouTubeListingFormView', () => {
    it('pide solo rubro, contenido sin rostro, precio y moneda', () => {
        const html = vista();

        expect(html).toContain('name="niche"');
        expect(html).toContain('name="sinRostro"');
        expect(html).toContain('name="precio"');
        expect(html).toContain('name="moneda"');
        expect(html).not.toContain('name="metrica"');
        expect(html).not.toContain('name="ingreso"');
        expect(html).not.toContain('name="pais"');
        expect(html).not.toContain('name="monetizado"');
        expect(texto(html)).toContain('Completá lo que falta');
    });

    it('muestra la valuación cuando la hay, con su aclaración', () => {
        const t = texto(vista({ estimated: { cents: 1_250_000, currency: 'USD' } }));

        expect(t).toContain('US$ 12.500');
        expect(t).toMatch(/números verificados de tu canal/);
    });

    it('sin valuación muestra un guion', () => {
        expect(texto(vista())).toContain('—');
    });

    it('un error trae su salida cuando existe', () => {
        const html = vista({
            state: { error: 'Ese canal ya lo publicaste.', next: { href: '/activos/l5', label: 'Ver el activo' } },
        });

        expect(texto(html)).toContain('Ese canal ya lo publicaste.');
        expect(html).toContain('href="/activos/l5"');
        expect(texto(html)).toContain('Ver el activo');
    });

    it('el botón dice qué crea y qué pasa después', () => {
        const t = texto(vista());

        expect(t).toContain('Crear borrador');
        expect(t).toMatch(/Nace como borrador y no lo ve nadie/);
    });
});
