import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReceiptReviewForm } from '@/components/ReceiptForms';

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
            isImage
            expected="AR$ 9.500"
            account="ana.vendedora.mp"
            confirmAction={accion}
            rejectAction={accion}
            confirmText="Confirmar la acreditación"
        />,
    );

    it('deja ver el comprobante antes de responder, con su vista previa', () => {
        expect(html).toContain('href="/operaciones/op-1/comprobantes/seller"');
        expect(html).toContain('rel="noopener"');
        expect(html).toMatch(/<img[^>]*src="\/operaciones\/op-1\/comprobantes\/seller"/);
    });

    it('pide verificar el monto y la cuenta en el banco, y avisa que confirmar no se deshace', () => {
        expect(texto(html)).toContain('Verificá en tu banco que se hayan acreditado AR$ 9.500 en la cuenta ana.vendedora.mp');
        expect(texto(html)).toContain('Una vez confirmado, no se puede deshacer.');
        expect(texto(html)).toContain('Confirmar la acreditación');
        expect(texto(html)).toContain('No se acreditó');
    });

    it('un PDF no tiene vista previa: se abre aparte', () => {
        const pdf = renderToStaticMarkup(
            <ReceiptReviewForm fileHref="/x" confirmAction={accion} rejectAction={accion} confirmText="Confirmar la acreditación" />,
        );
        expect(pdf).not.toMatch(/<img/);
        expect(texto(pdf)).toContain('Ver el comprobante completo');
    });
});
