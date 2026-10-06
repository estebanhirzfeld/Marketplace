import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActionFailure } from '@/components/OperationAction';

describe('ActionFailure', () => {
    it('sin camino siguiente muestra solo el error', () => {
        const html = renderToStaticMarkup(<ActionFailure error="No pudimos hacerlo." />);

        expect(html).toContain('No pudimos hacerlo.');
        expect(html).not.toContain('<a');
    });

    it('con camino siguiente suma un enlace hacia donde se resuelve', () => {
        const html = renderToStaticMarkup(
            <ActionFailure
                error="Para publicar tenés que vincular tu cuenta de Mercado Pago."
                next={{ href: '/perfil#mercadopago', label: 'Vincular Mercado Pago' }}
            />,
        );

        expect(html).toContain('href="/perfil#mercadopago"');
        expect(html).toContain('Vincular Mercado Pago');
    });
});
