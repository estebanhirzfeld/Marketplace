import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CopyValueButtonView } from '@/components/CopyValueButton';
import { copyText } from '@/lib/clipboard';

/**
 * Un valor se copia con un clic (el mail de custodia, el TXT del DNS). Sin DOM
 * en los tests, se fija el marcado de cada estado y la lógica de copiado por
 * separado.
 */

const EMAIL = 'custodia@traspaso.com';
const TXT = 'traspaso-verificacion=178cd4d4534d977fbdf74f70';

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

describe('CopyValueButtonView', () => {
    it('es un botón con la etiqueta «Copiar <valor>» que muestra el valor', () => {
        const html = renderToStaticMarkup(<CopyValueButtonView value={EMAIL} copied={false} onCopy={() => {}} />);

        expect(html).toContain('<button');
        expect(html).toContain(`aria-label="Copiar ${EMAIL}"`);
        expect(texto(html)).toContain(EMAIL);
        expect(texto(html)).not.toContain('Copiado');
    });

    it('al copiar muestra «Copiado»', () => {
        const html = renderToStaticMarkup(<CopyValueButtonView value={EMAIL} copied onCopy={() => {}} />);

        expect(texto(html)).toContain('Copiado');
    });

    it('la etiqueta accesible se puede nombrar, para que el lector de pantalla diga qué se copia', () => {
        const html = renderToStaticMarkup(
            <CopyValueButtonView value={TXT} label="Copiar el valor del registro" copied={false} onCopy={() => {}} />,
        );

        expect(html).toContain('aria-label="Copiar el valor del registro"');
        expect(texto(html)).toContain(TXT);
    });
});

describe('copyText', () => {
    it('escribe en el portapapeles y avisa que pudo', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);

        expect(await copyText(EMAIL, { writeText })).toBe(true);
        expect(writeText).toHaveBeenCalledWith(EMAIL);
    });

    it('si el navegador lo rechaza, no rompe y avisa que no pudo', async () => {
        const writeText = vi.fn().mockRejectedValue(new Error('denegado'));

        expect(await copyText(EMAIL, { writeText })).toBe(false);
    });

    it('sin portapapeles disponible, no rompe', async () => {
        expect(await copyText(EMAIL, undefined)).toBe(false);
    });
});
