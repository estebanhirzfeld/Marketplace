import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PriceSection } from '@/components/PriceSection';

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

function vista(props: Partial<React.ComponentProps<typeof PriceSection>> = {}) {
    return renderToStaticMarkup(
        <PriceSection
            currency="USD"
            onCurrencyChange={() => {}}
            price=""
            onPriceChange={() => {}}
            estimated={null}
            {...props}
        />,
    );
}

describe('PriceSection', () => {
    it('el precio va primero, con moneda y monto', () => {
        const html = vista();

        expect(texto(html)).toContain('Tu precio');
        expect(html).toContain('name="precio"');
        expect(html).toContain('name="moneda"');
        expect(html.indexOf('Tu precio')).toBeLessThan(html.indexOf('REFERENCIA'));
    });

    it('la valuación queda como referencia al costado', () => {
        const t = texto(vista({ estimated: { cents: 1_000_000, currency: 'USD' } }));

        expect(t).toContain('REFERENCIA');
        expect(t).toContain('Nuestra valuación');
        expect(t).toContain('US$ 10.000');
    });

    it('dice cuánto se aparta el precio de la valuación', () => {
        const arriba = texto(vista({ price: '13000', estimated: { cents: 1_000_000, currency: 'USD' } }));
        const abajo = texto(vista({ price: '8000', estimated: { cents: 1_000_000, currency: 'USD' } }));

        expect(arriba).toContain('Tu precio: 30 % arriba');
        expect(abajo).toContain('Tu precio: 20 % abajo');
    });

    it('sin precio o sin valuación no muestra la diferencia', () => {
        expect(texto(vista({ estimated: { cents: 1_000_000, currency: 'USD' } }))).not.toContain('Tu precio:');
        expect(texto(vista({ price: '500' }))).not.toContain('Tu precio:');
        expect(texto(vista())).toContain('—');
    });

    it('en pesos aclara que la valuación está en dólares y no compara', () => {
        const t = texto(
            vista({ currency: 'ARS', price: '13000000', estimated: { cents: 1_000_000, currency: 'USD' } }),
        );

        expect(t).toContain('US$ 10.000');
        expect(t).toContain('en USD');
        expect(t).not.toContain('Tu precio:');
    });

    it('aclara de dónde sale la valuación y la comisión', () => {
        const t = texto(vista());

        expect(t).toContain('Vos recibís el precio menos el 5 % de comisión.');
    });
});
