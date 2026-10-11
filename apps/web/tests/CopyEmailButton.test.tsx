import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CopyEmailButtonView } from '@/components/CopyEmailButton';
import { copyText } from '@/lib/clipboard';

/**
 * El mail de custodia se copia con un clic. Sin DOM en los tests, se fija el
 * marcado de cada estado y la lógica de copiado por separado.
 */

const EMAIL = 'custodia@traspaso.com';

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

describe('CopyEmailButtonView', () => {
    it('es un botón con la etiqueta «Copiar <email>» que muestra la dirección', () => {
        const html = renderToStaticMarkup(<CopyEmailButtonView email={EMAIL} copied={false} onCopy={() => {}} />);

        expect(html).toContain('<button');
        expect(html).toContain(`aria-label="Copiar ${EMAIL}"`);
        expect(texto(html)).toContain(EMAIL);
        expect(texto(html)).not.toContain('Copiado');
    });

    it('al copiar muestra «Copiado»', () => {
        const html = renderToStaticMarkup(<CopyEmailButtonView email={EMAIL} copied onCopy={() => {}} />);

        expect(texto(html)).toContain('Copiado');
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
