import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MoneyDto } from '@marketplace/api-contract';
import { OperationHeadline, OperationSummary } from '@/components/OperationSummary';

/*
 * El resumen fijo de una operación: los montos de quien mira, dónde recibe o
 * cobra, el contrato y la publicación. Arriba, el monto que le importa a ese rol.
 */

const ars = (pesos: number): MoneyDto => ({ cents: pesos * 100, currency: 'ARS' });
const amounts = {
    finalPrice: ars(1_500_000),
    buyerPays: ars(1_575_000),
    sellerReceives: ars(1_425_000),
    platformEarns: ars(150_000),
};

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

describe('OperationSummary', () => {
    it('al comprador: precio, comisión y lo que pagará; dónde recibirá el canal', () => {
        const t = texto(
            renderToStaticMarkup(
                <OperationSummary role="buyer" assetType="youtube" {...amounts} receivingAccount="comprador@correo.com" listingHref="/listings/l1" />,
            ),
        );

        expect(t).toContain('Precio AR$ 1.500.000');
        expect(t).toContain('Comisión AR$ 75.000');
        expect(t).toContain('Pagarás AR$ 1.575.000');
        expect(t).toContain('Recibirás el canal en comprador@correo.com');
    });

    it('al vendedor: precio, comisión y lo que recibirá; dónde cobrará', () => {
        const t = texto(
            renderToStaticMarkup(
                <OperationSummary role="seller" assetType="youtube" {...amounts} receivingAccount="ana.vendedora.mp" listingHref="/listings/l1" />,
            ),
        );

        expect(t).toContain('Comisión AR$ 75.000');
        expect(t).toContain('Recibirás AR$ 1.425.000');
        expect(t).toContain('Cobrarás en ana.vendedora.mp');
    });

    it('a la plataforma: lo que paga el comprador, recibe el vendedor y la comisión', () => {
        const t = texto(
            renderToStaticMarkup(
                <OperationSummary role="platform" assetType="youtube" {...amounts} receivingAccount="comprador@correo.com" listingHref="/listings/l1" />,
            ),
        );

        expect(t).toContain('El comprador paga AR$ 1.575.000');
        expect(t).toContain('El vendedor recibe AR$ 1.425.000');
        expect(t).toContain('Comisión AR$ 150.000');
        expect(t).toContain('Entrega al comprador en comprador@correo.com');
    });

    it('en un sitio el comprador recibe el sitio, no un canal', () => {
        const t = texto(
            renderToStaticMarkup(
                <OperationSummary role="buyer" assetType="web" {...amounts} receivingAccount="comprador@correo.com" listingHref="/listings/l1" />,
            ),
        );

        expect(t).toContain('Recibirás el sitio en');
        expect(t).not.toMatch(/canal/i);
    });

    it('enlaza el contrato firmado y la publicación', () => {
        const html = renderToStaticMarkup(
            <OperationSummary role="buyer" assetType="youtube" {...amounts} contractHref="/contratos/c1" listingHref="/listings/l1" />,
        );

        expect(html).toMatch(/<a[^>]*href="\/contratos\/c1"[^>]*>Ver el contrato firmado<\/a>/);
        expect(html).toMatch(/<a[^>]*href="\/listings\/l1"[^>]*>Ver la publicación<\/a>/);
    });

    it('antes del acuerdo muestra la oferta actual y no enlaza un contrato', () => {
        const html = renderToStaticMarkup(
            <OperationSummary role="buyer" assetType="youtube" currentOffer={ars(1_400_000)} listingHref="/listings/l1" />,
        );

        expect(texto(html)).toContain('Oferta actual AR$ 1.400.000');
        expect(html).not.toContain('Ver el contrato firmado');
    });
});

describe('OperationHeadline', () => {
    it('el comprador lee lo que pagará y el vendedor lo que recibirá', () => {
        expect(texto(renderToStaticMarkup(<OperationHeadline role="buyer" {...amounts} buyerName="Juan" sellerName="Ana" />))).toContain(
            'Pagarás AR$ 1.575.000',
        );
        expect(texto(renderToStaticMarkup(<OperationHeadline role="seller" {...amounts} buyerName="Juan" sellerName="Ana" />))).toContain(
            'Recibirás AR$ 1.425.000',
        );
    });

    it('la plataforma lee quién vende a quién y el precio', () => {
        expect(texto(renderToStaticMarkup(<OperationHeadline role="platform" {...amounts} buyerName="Juan" sellerName="Ana" />))).toContain(
            'Ana a Juan · AR$ 1.500.000',
        );
    });
});
