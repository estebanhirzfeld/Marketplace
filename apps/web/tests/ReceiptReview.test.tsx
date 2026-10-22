import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoherenceReview, ReviewRequest, ReviewResolution, ReviewStatus, SellerReviewResponse } from '@/components/ReceiptReview';

/*
 * La revisión de un comprobante rechazado, para cada rol. Los tests fijan lo
 * que cada uno necesita para decidir, y que nadie lea que un documento de las
 * partes es prueba.
 */

async function accion() {
    return {};
}

function texto(html: string): string {
    return html.replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

describe('ReviewRequest — el comprador', () => {
    it('primero pregunta si la transferencia figura en su banco', () => {
        const t = texto(renderToStaticMarkup(<ReviewRequest action={accion} recipient="seller" />));

        expect(t).toContain('¿La transferencia figura como realizada en tu banco?');
        expect(t).toContain('Solicitar la revisión de la plataforma');
    });
});

describe('ReviewStatus — el comprador espera', () => {
    it('explica que el plazo se suspende y el activo sigue en custodia', () => {
        const t = texto(renderToStaticMarkup(<ReviewStatus hasBankReference addReferenceAction={accion} />));

        expect(t).toContain('El comprobante está en revisión');
        expect(t).toContain('El plazo de pago queda suspendido y el activo permanece en custodia');
        expect(t).not.toContain('ID COELSA');
    });

    it('sin el ID COELSA, se lo pide y dice dónde conseguirlo', () => {
        const html = renderToStaticMarkup(<ReviewStatus hasBankReference={false} addReferenceAction={accion} />);

        const input = html.match(/<input[^>]*name="bankReference"[^>]*>/)?.[0] ?? '';
        expect(input).toContain('required');
        expect(texto(html)).toContain('Solicitá a tu banco el ID COELSA de la transferencia');
    });
});

describe('SellerReviewResponse — el vendedor', () => {
    const html = renderToStaticMarkup(
        <SellerReviewResponse
            fileHref="/operaciones/op/comprobantes/seller"
            amount="AR$ 1.425.000"
            account="ana.vendedora.mp"
            deadline="2026-10-27T02:59:59.000Z"
            confirmAction={accion}
            statementAction={accion}
        />,
    );

    it('dice que el comprobante coincide con su cuenta, y qué pasa si no responde', () => {
        const t = texto(html);

        expect(t).toContain('El comprador solicitó la revisión del pago de AR$ 1.425.000');
        expect(t).toContain('Su comprobante coincide con tu cuenta y con tu CUIT');
        expect(t).toContain('Si no respondés, daremos el pago por acreditado.');
    });

    it('puede confirmar, o adjuntar sus movimientos como información', () => {
        const t = texto(html);

        expect(t).toContain('¿El pago figura en tu cuenta ana.vendedora.mp?');
        expect(t).toContain('Confirmar la acreditación');
        expect(t).toContain('Adjuntar los movimientos');
        expect(t).toContain('los sumaremos a la revisión');
    });
});

describe('CoherenceReview — la plataforma', () => {
    it('lista lo que tiene que coincidir, con los CUIT de las dos partes', () => {
        const t = texto(
            renderToStaticMarkup(
                <CoherenceReview
                    fileHref="/x"
                    facts={{ amount: 'AR$ 1.425.000', destination: 'ana.vendedora.mp', destinationTaxId: '20123456786', custodyDate: '21 de octubre de 2026' }}
                    coherentAction={accion}
                    incoherentAction={accion}
                />,
            ),
        );

        expect(t).toContain('Monto: AR$ 1.425.000');
        expect(t).toContain('CBU o alias de destino: ana.vendedora.mp');
        expect(t).toContain('CUIT de destino: 20123456786');
        expect(t).toContain('CUIT de origen: el del KYC del comprador');
        expect(t).toContain('todavía no lo agregó');
        expect(t).toContain('Solicitar el rastreo bancario');
        expect(t).toContain('Rechazar el comprobante');
    });
});

describe('ReviewResolution — la plataforma', () => {
    it('decide por el rastreo, no por los movimientos del vendedor', () => {
        const t = texto(
            renderToStaticMarkup(
                <ReviewResolution fileHref="/x" statementHref="/m" bankReference="ABC" creditedAction={accion} notCreditedAction={accion} />,
            ),
        );

        expect(t).toContain('Ver los movimientos del vendedor');
        expect(t).toContain('Los movimientos del vendedor son información, no prueba.');
        expect(t).toContain('El pago se acreditó');
        expect(t).toContain('El pago no se acreditó');
    });
});
