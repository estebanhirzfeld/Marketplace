import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SellMoreAside } from '@/components/SellMoreAside';

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function render(subject: 'canal' | 'sitio'): string {
    return texto(
        renderToStaticMarkup(<SellMoreAside accessHref="#" subject={subject} showAccess showMercadoPago={false} />),
    );
}

describe('SellMoreAside: la nota del acceso', () => {
    it('para un canal conserva el plazo de YouTube', () => {
        expect(render('canal')).toContain('A los 7 días tu canal la muestra y gana más visibilidad en el mercado.');
    });

    it('para un sitio no habla de días ni de canal', () => {
        const html = render('sitio');

        expect(html).toContain('Con acceso, el traspaso es inmediato y tu sitio gana más visibilidad en el mercado.');
        expect(html).not.toContain('7 días');
        expect(html).not.toContain('canal');
    });
});
