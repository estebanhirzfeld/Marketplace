import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DraftChoice } from '@/components/DraftChoice';

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/\s+([.,])/g, '$1').trim();
}

const noop = async () => {};

describe('DraftChoice', () => {
    it('ofrece continuar el borrador o publicar otro canal', () => {
        const html = renderToStaticMarkup(
            <DraftChoice channelTitle="Lovi en Reddit" hasPrice draftHref="/activos/l1" connectAction={noop} />,
        );
        const t = texto(html);

        expect(t).toContain('Tenés un canal a medio publicar');
        expect(t).toContain('Lovi en Reddit');
        expect(t).toContain('BORRADOR');
        expect(t).toContain('Ya tiene precio: solo falta publicarlo.');
        expect(t).toContain('Continuar con este borrador');
        expect(html).toContain('href="/activos/l1"');
        expect(t).toContain('Publicar otro canal');
        expect(t).toContain('Te llevamos a YouTube para que elijas cuál.');
        expect(t).toContain('Conectar otro canal');
    });

    it('sin precio, dice lo que falta en vez de afirmar que ya tiene', () => {
        const t = texto(
            renderToStaticMarkup(
                <DraftChoice channelTitle="Lovi" hasPrice={false} draftHref="/activos/l1" connectAction={noop} />,
            ),
        );

        expect(t).toContain('Te falta ponerle precio.');
        expect(t).not.toContain('Ya tiene precio');
    });
});
