import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TimelineStageDto } from '@marketplace/api-contract';
import { OperationStages } from '@/components/OperationStages';

/*
 * Las seis etapas de una operación en una línea: cada una con su nombre y su
 * fecha, la actual marcada para los lectores de pantalla. En el teléfono, una
 * barra con «Etapa N de 6 · …» y la lista plegada.
 */

const NOW = new Date('2026-10-23T12:00:00.000Z');

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

const paying: TimelineStageDto[] = [
    { key: 'negotiation', state: 'done', at: '2026-10-18T12:00:00.000Z' },
    { key: 'contract', state: 'done', at: '2026-10-20T12:00:00.000Z' },
    { key: 'custody', state: 'done', at: '2026-10-23T12:00:00.000Z' },
    { key: 'payment', state: 'current' },
    { key: 'delivery', state: 'pending' },
    { key: 'closing', state: 'pending' },
];

describe('OperationStages', () => {
    it('nombra las seis etapas de un canal con frases nominales', () => {
        const t = texto(renderToStaticMarkup(<OperationStages stages={paying} assetType="youtube" now={NOW} />));

        for (const label of ['Precio acordado', 'Contrato firmado', 'Acceso cedido', 'Pago del canal', 'Entrega del canal', 'Cierre']) {
            expect(t).toContain(label);
        }
    });

    it('en un sitio nunca habla de un canal', () => {
        const t = texto(renderToStaticMarkup(<OperationStages stages={paying} assetType="web" now={NOW} />));

        expect(t).toContain('Pago del sitio');
        expect(t).toContain('Entrega del sitio');
        expect(t).not.toMatch(/canal/i);
    });

    it('cada etapa hecha lleva su fecha y la actual, su plazo', () => {
        const t = texto(
            renderToStaticMarkup(
                <OperationStages stages={paying} assetType="youtube" currentDeadline="2026-11-06T12:00:00.000Z" now={NOW} />,
            ),
        );

        expect(t).toContain('18 de octubre');
        expect(t).toContain('20 de octubre');
        expect(t).toContain('Hasta el 6 de noviembre');
    });

    it('marca la etapa actual con aria-current y las hechas se llenan una tras otra', () => {
        const html = renderToStaticMarkup(<OperationStages stages={paying} assetType="youtube" now={NOW} />);

        const current = html.match(/<li[^>]*aria-current="step"[^>]*>.*?<\/li>/g) ?? [];
        expect(current).toHaveLength(1);
        expect(current[0]).toContain('Pago del canal');
        expect(html.match(/class="etapa"/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
        expect(html).toContain('etapa-actual');
        expect(html).toContain('animation-delay:440ms');
    });

    it('en el teléfono dice en qué etapa está, de seis', () => {
        const t = texto(renderToStaticMarkup(<OperationStages stages={paying} assetType="youtube" now={NOW} />));

        expect(t).toContain('Etapa 4 de 6 · Pago del canal');
    });

    it('sin etapas no dibuja nada', () => {
        expect(renderToStaticMarkup(<OperationStages stages={[]} assetType="youtube" now={NOW} />)).toBe('');
    });

    it('una operación cancelada no tiene etapa actual', () => {
        const cancelled: TimelineStageDto[] = paying.map((s) => (s.state === 'current' ? { ...s, state: 'pending' } : s));
        const html = renderToStaticMarkup(<OperationStages stages={cancelled} assetType="youtube" cancelled now={NOW} />);

        expect(html).not.toContain('aria-current="step"');
        expect(texto(html)).toContain('Operación cancelada');
    });
});
