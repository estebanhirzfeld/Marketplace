import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VerificationCards } from '@/components/VerificationCards';

const base = {
    ownership: { done: true, sourceLabel: 'YouTube' },
    mercadoPago: { done: false },
    ownershipSource: 'YouTube',
    kycVerified: true,
    verifyAction: async () => {},
};

describe('VerificationCards', () => {
    it('sin acceso registrado no dibuja la tarjeta: lo pide el panel de acceso', () => {
        const html = renderToStaticMarkup(<VerificationCards {...base} access={{ done: false }} />);
        expect(html).not.toContain('Acceso de administración');
    });

    it('lo ya logrado no repite líneas sueltas: lo cuenta el desglose del nivel', () => {
        const html = renderToStaticMarkup(
            <VerificationCards {...base} access={{ done: true }} mercadoPago={{ done: true }} />,
        );
        expect(html).not.toContain('Acceso de administración');
        expect(html).not.toContain('Titularidad comprobada');
        expect(html).not.toContain('Mercado Pago vinculado');
    });

    it('deja una sola línea para la identidad, que no puntúa', () => {
        const html = renderToStaticMarkup(<VerificationCards {...base} access={{ done: true }} />);
        expect(html).toContain('Identidad verificada · requisito para publicar');
    });

    it('con DNS la tarjeta de titularidad abre el diálogo en vez de redirigir a Google', () => {
        const html = renderToStaticMarkup(
            <VerificationCards
                {...base}
                ownership={{ done: false, sourceLabel: 'tu DNS' }}
                ownershipSource="tu DNS"
                dnsVerification={<button type="button">Comprobar con tu DNS</button>}
            />,
        );

        expect(html).toContain('Comprobar titularidad');
        expect(html).toContain('Comprobar con tu DNS');
        expect(html).not.toContain('Redirigiendo a Google');
        expect(html).not.toContain('<form');
    });

    it('sin DNS la tarjeta sigue redirigiendo a Google', () => {
        const html = renderToStaticMarkup(
            <VerificationCards {...base} ownership={{ done: false, sourceLabel: 'YouTube' }} />,
        );

        expect(html).toContain('Comprobar con YouTube');
        expect(html).toContain('<form');
    });
});
