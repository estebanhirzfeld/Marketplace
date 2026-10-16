import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssetSummaryCard, OwnershipCheck, OwnershipProof } from '@/components/AssetSummaryCard';
import { SendToReviewLink } from '@/components/SendToReviewLink';
import { WebMark } from '@/components/AssetTypeCard';

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const noop = async () => ({});

describe('AssetSummaryCard', () => {
    it('lleva la marca, el nombre y el dominio con el rubro', () => {
        const html = renderToStaticMarkup(
            <AssetSummaryCard
                name="Siteweb"
                subtitle="deliaorrego.online · Entretenimiento"
                mark={<WebMark width={52} />}
            />,
        );

        expect(html).toContain('aria-label="Sitio web"');
        expect(texto(html)).toContain('Siteweb');
        expect(texto(html)).toContain('deliaorrego.online · Entretenimiento');
    });

    it('sin marca usa la inicial del nombre', () => {
        const html = renderToStaticMarkup(<AssetSummaryCard name="Mi tienda" subtitle="Sitio web" />);

        expect(html).not.toContain('aria-label="Sitio web"');
        expect(texto(html)).toContain('M');
    });

    it('no dibuja bloques vacíos: sin nota ni contenido no hay nada más que la cabecera', () => {
        const html = renderToStaticMarkup(<AssetSummaryCard name="Mi tienda" subtitle="Sitio web" />);

        expect(html).not.toMatch(/<span[^>]*><\/span>/);
        expect(html).not.toMatch(/<div[^>]*><\/div>/);
    });

    it('muestra la nota cuando la hay', () => {
        const html = renderToStaticMarkup(<AssetSummaryCard name="Mi tienda" subtitle="Sitio web" note="US$ 100 por mes" />);

        expect(texto(html)).toContain('US$ 100 por mes');
    });

    it('aloja el bloque de titularidad debajo de la cabecera', () => {
        const html = renderToStaticMarkup(
            <AssetSummaryCard name="Mi tienda" subtitle="Sitio web">
                <OwnershipProof sourceLabel="tu DNS" />
            </AssetSummaryCard>,
        );

        expect(texto(html)).toContain('Titularidad comprobada con tu DNS');
    });
});

describe('OwnershipCheck', () => {
    it('invita a comprobar, dice cuánto suma y deja la acción primaria', () => {
        const html = renderToStaticMarkup(<OwnershipCheck action={<button type="button">Comprobar con tu DNS</button>} />);
        const t = texto(html);

        expect(t).toContain('Comprobá que el sitio es tuyo');
        expect(t).toContain('+1 NIVEL');
        expect(t).toContain('Agregás un registro en el DNS de tu dominio y lo detectamos solo, en minutos.');
        expect(t).toContain('Publicás sin revisión y tus números llevan sello.');
        expect(t).toContain('Comprobar con tu DNS');
    });

    it('sin la salida alternativa no deja un hueco', () => {
        const html = renderToStaticMarkup(<OwnershipCheck action={<button type="button">Comprobar</button>} />);

        expect(texto(html)).not.toContain('No puedo cargar el registro');
    });

    it('con la salida alternativa la ofrece junto a la acción', () => {
        const html = renderToStaticMarkup(
            <OwnershipCheck
                action={<button type="button">Comprobar</button>}
                alternative={<SendToReviewLink action={noop} />}
            />,
        );

        expect(texto(html)).toContain('No puedo cargar el registro');
    });
});

describe('SendToReviewLink', () => {
    it('es un botón con forma de enlace que envía la acción', () => {
        const html = renderToStaticMarkup(<SendToReviewLink action={noop} />);

        expect(html).toContain('<form');
        expect(html).toContain('type="submit"');
        expect(texto(html)).toContain('No puedo cargar el registro');
    });
});

describe('OwnershipProof', () => {
    it('deja la constancia en una línea, sin pedir nada', () => {
        const html = renderToStaticMarkup(<OwnershipProof sourceLabel="tu DNS" />);

        expect(texto(html)).toBe('Titularidad comprobada con tu DNS');
        expect(html).not.toContain('<button');
    });
});
