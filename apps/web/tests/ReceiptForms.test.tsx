import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReceiptReviewForm, ReceiptUploadForm } from '@/components/ReceiptForms';

/*
 * Quien recibió la plata mira el comprobante y responde; el comprador lo sube
 * o lo reemplaza. Los tests fijan lo que cada uno necesita ver para decidir.
 */

async function accion() {
    return {};
}

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

describe('ReceiptReviewForm', () => {
    const html = renderToStaticMarkup(
        <ReceiptReviewForm
            fileHref="/operaciones/op-1/comprobantes/seller"
            confirmAction={accion}
            rejectAction={accion}
            confirmText="Me llegaron AR$ 9.500"
        />,
    );

    it('deja ver el comprobante antes de responder', () => {
        expect(html).toContain('href="/operaciones/op-1/comprobantes/seller"');
        expect(html).toContain('rel="noopener"');
    });

    it('confirma con el monto a la vista, y rechazar pide el motivo escrito', () => {
        expect(texto(html)).toContain('Me llegaron AR$ 9.500');
        expect(html).toMatch(/<textarea[^>]*name="reason"[^>]*required/);
        expect(texto(html)).toContain('Rechazar el comprobante');
    });
});

describe('ReceiptUploadForm', () => {
    it('acepta solo imágenes y PDF, y avisa el tamaño máximo', () => {
        const html = renderToStaticMarkup(<ReceiptUploadForm action={accion} />);

        expect(html).toContain('accept="application/pdf,image/png,image/jpeg,image/webp"');
        expect(texto(html)).toContain('Subí el comprobante');
        expect(texto(html)).toContain('hasta 5 MB');
    });

    it('si reemplaza uno rechazado, lo dice', () => {
        const html = renderToStaticMarkup(<ReceiptUploadForm action={accion} replacing />);

        expect(texto(html)).toContain('Subí otro comprobante');
    });
});
