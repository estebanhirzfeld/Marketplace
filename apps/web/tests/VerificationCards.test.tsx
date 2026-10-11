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

    it('con acceso registrado deja la línea de logro', () => {
        const html = renderToStaticMarkup(<VerificationCards {...base} access={{ done: true }} />);
        expect(html).toContain('Acceso de administración');
    });
});
