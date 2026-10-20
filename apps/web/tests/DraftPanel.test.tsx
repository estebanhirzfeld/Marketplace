import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DraftPanel } from '@/components/DraftPanel';

/** La tarjeta del borrador sin titularidad: con DNS no hay cuenta de Google que nombrar. */

const base = {
    variant: 'unverified' as const,
    subject: 'sitio',
    price: 'US$ 1.500',
    kycVerified: true,
    publishAction: async () => ({}),
    reviewAction: async () => ({}),
    verifyAction: async () => {},
};

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

describe('DraftPanel sin titularidad', () => {
    it('con Google pide la cuenta y redirige', () => {
        const html = renderToStaticMarkup(<DraftPanel {...base} sourceLabel="AdSense" />);

        expect(texto(html)).toContain('Con tu cuenta de AdSense lo comprobamos en un minuto');
        expect(html).toContain('Comprobar con AdSense');
    });

    it('con DNS muestra el botón del diálogo y no habla de cuentas de Google', () => {
        const html = renderToStaticMarkup(
            <DraftPanel
                {...base}
                sourceLabel="tu DNS"
                dnsVerification={<button type="button">Comprobar con tu DNS</button>}
            />,
        );

        expect(texto(html)).toContain('Cargando un registro en el DNS de tu dominio lo comprobamos en unos minutos');
        expect(html).toContain('Comprobar con tu DNS');
        expect(html).not.toContain('Redirigiendo a Google');
        expect(texto(html)).not.toContain('cuenta de');
        expect(texto(html)).toContain('¿No podés cargar el registro?');
    });
});
