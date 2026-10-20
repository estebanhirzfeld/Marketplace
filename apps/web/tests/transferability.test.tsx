import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TransferStatus } from '@/components/Transferability';
import { fechaSinAnioActual } from '@/lib/format';

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/\s+([.,])/g, '$1').trim();
}

describe('fechaSinAnioActual', () => {
    const hoy = new Date('2026-10-11T12:00:00.000Z');

    it('omite el año si es el actual', () => {
        expect(fechaSinAnioActual('2026-10-18T12:00:00.000Z', hoy)).toBe('18 de octubre');
    });

    it('incluye el año si es otro', () => {
        expect(fechaSinAnioActual('2027-01-05T12:00:00.000Z', hoy)).toBe('5 de enero de 2027');
    });
});

describe('TransferStatus (aviso público)', () => {
    it('con fecha: una línea para el comprador, sin reglas internas', () => {
        const html = renderToStaticMarkup(
            <TransferStatus transferable={false} transferableFrom="2026-10-18T12:00:00.000Z" now="2026-10-11T12:00:00.000Z" />,
        );
        const t = texto(html);

        expect(t).toContain('Se transfiere desde el 18 de octubre');
        expect(t).toContain('Podés ofertar desde hoy.');
        expect(html).toContain('<svg');
        expect(t).not.toMatch(/admin|dueño|propietari|7 días|siete/i);
    });

    it('inmediata: etiqueta y promesa corta, con el rayo', () => {
        const html = renderToStaticMarkup(<TransferStatus transferable now="2026-10-11T12:00:00.000Z" />);
        const t = texto(html);

        expect(t).toContain('TRANSFERENCIA INMEDIATA');
        expect(t).toContain('Si cerrás hoy, el traspaso empieza hoy.');
        expect(html).toContain('M11 2h7l-4 7h5L8 22l2.5-9H6z');
    });

    it('sin acceso cedido: tampoco explica la custodia', () => {
        const t = texto(renderToStaticMarkup(<TransferStatus transferable={false} now="2026-10-11T12:00:00.000Z" />));

        expect(t).toContain('Podés ofertar desde hoy.');
        expect(t).not.toMatch(/admin|dueño|propietari|7 días|siete|custodia|plataforma/i);
    });
});
