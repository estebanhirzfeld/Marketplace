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
});
