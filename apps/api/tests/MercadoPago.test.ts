import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { MercadoPagoGateway } from '../src/adapters/MercadoPagoGateway';
import { firmaValida } from '../src/adapters/MercadoPagoSignature';

/**
 * El adaptador contra respuestas fabricadas y la validación de la firma. Lo que
 * se prueba es la traducción de montos —el sistema trabaja en centavos y
 * MercadoPago en unidades— y que el token no se filtre en el mensaje de un
 * error.
 */

const CONFIG = {
    accessToken: 'TEST-token-que-no-debe-aparecer',
    backUrl: 'http://localhost:3000/operaciones',
    notificationUrl: 'http://localhost:3001/webhooks/mercadopago',
};

function json(cuerpo: unknown, status = 200): Response {
    return new Response(JSON.stringify(cuerpo), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

function armar(...respuestas: Response[]) {
    const impl = vi.fn();
    for (const r of respuestas) impl.mockResolvedValueOnce(r);
    return { gateway: new MercadoPagoGateway(CONFIG, impl), impl };
}

describe('MercadoPagoGateway — armado del checkout', () => {
    const PREFERENCIA = () => json({ id: 'pref-1', init_point: 'https://mp/checkout/pref-1' });

    it('devuelve el link de pago', async () => {
        const { gateway } = armar(PREFERENCIA());

        const checkout = await gateway.createCheckout({
            externalReference: 'op-1',
            description: 'Compra',
            amountCents: 1_050_000,
            currency: 'USD',
            payerEmail: 'comprador@example.com',
        });

        expect(checkout.url).toBe('https://mp/checkout/pref-1');
        expect(checkout.externalId).toBe('pref-1');
    });

    /** El dominio trabaja en centavos; MercadoPago espera unidades. */
    it('convierte los centavos a unidades', async () => {
        const { gateway, impl } = armar(PREFERENCIA());

        await gateway.createCheckout({
            externalReference: 'op-1',
            description: 'Compra',
            amountCents: 1_050_000,
            currency: 'USD',
            payerEmail: 'comprador@example.com',
        });

        const cuerpo = JSON.parse(impl.mock.calls[0][1].body);
        expect(cuerpo.items[0].unit_price).toBe(10_500);
        expect(cuerpo.external_reference).toBe('op-1');
    });

    it('no filtra el token cuando MercadoPago rechaza el pedido', async () => {
        const { gateway } = armar(json({ message: CONFIG.accessToken }, 401));

        await expect(
            gateway.createCheckout({
                externalReference: 'op-1',
                description: 'Compra',
                amountCents: 100,
                currency: 'USD',
                payerEmail: 'comprador@example.com',
            }),
        ).rejects.not.toThrow(/token-que-no-debe-aparecer/);
    });
});

describe('MercadoPagoGateway — consulta de un pago', () => {
    const PAGO = {
        id: 1234567890,
        status: 'approved',
        payment_type_id: 'credit_card',
        transaction_amount: 10_500,
        currency_id: 'USD',
        external_reference: 'op-1',
    };

    it('convierte las unidades de vuelta a centavos', async () => {
        const { gateway } = armar(json(PAGO));

        const pago = await gateway.fetchPayment('1234567890');

        expect(pago?.amountCents).toBe(1_050_000);
        expect(pago?.externalId).toBe('1234567890');
        expect(pago?.method).toBe('credit_card');
        expect(pago?.externalReference).toBe('op-1');
    });

    it('reconoce un pago aprobado', async () => {
        const { gateway } = armar(json(PAGO));

        expect((await gateway.fetchPayment('1'))?.status).toBe('approved');
    });

    /**
     * MercadoPago tiene más estados que los tres del dominio. Dar por aprobado
     * algo que no lo está sería entregar un activo sin haber cobrado, así que
     * todo lo desconocido cae en pendiente.
     */
    it('trata un estado desconocido como pendiente', async () => {
        const { gateway } = armar(json({ ...PAGO, status: 'in_mediation' }));

        expect((await gateway.fetchPayment('1'))?.status).toBe('pending');
    });

    it('reconoce los estados definitivamente negativos', async () => {
        for (const status of ['rejected', 'cancelled', 'refunded']) {
            const { gateway } = armar(json({ ...PAGO, status }));
            expect((await gateway.fetchPayment('1'))?.status).toBe('rejected');
        }
    });

    it('devuelve null si el pago no existe', async () => {
        const { gateway } = armar(json({}, 404));

        expect(await gateway.fetchPayment('inventado')).toBeNull();
    });

    /** Sin referencia externa no hay forma de saber a qué operación pertenece. */
    it('devuelve null si el pago no trae referencia externa', async () => {
        const { gateway } = armar(json({ ...PAGO, external_reference: undefined }));

        expect(await gateway.fetchPayment('1')).toBeNull();
    });
});

describe('Firma del webhook', () => {
    const SECRETO = 'secreto-del-webhook';

    function firmar(dataId: string, requestId: string, ts: string): string {
        const manifiesto = `id:${dataId};request-id:${requestId};ts:${ts};`;
        const v1 = createHmac('sha256', SECRETO).update(manifiesto).digest('hex');
        return `ts=${ts},v1=${v1}`;
    }

    it('acepta una firma legítima', () => {
        const signature = firmar('123', 'req-1', '1700000000');

        expect(
            firmaValida({ signature, requestId: 'req-1', dataId: '123', secret: SECRETO }),
        ).toBe(true);
    });

    it('rechaza una firma armada con otro secreto', () => {
        const ajena = `ts=1700000000,v1=${createHmac('sha256', 'otro').update('x').digest('hex')}`;

        expect(
            firmaValida({ signature: ajena, requestId: 'req-1', dataId: '123', secret: SECRETO }),
        ).toBe(false);
    });

    /** El id entra en el manifiesto: no se puede reusar una firma para otro pago. */
    it('rechaza una firma válida de otro pago', () => {
        const signature = firmar('123', 'req-1', '1700000000');

        expect(
            firmaValida({ signature, requestId: 'req-1', dataId: '999', secret: SECRETO }),
        ).toBe(false);
    });

    it('rechaza un aviso sin firma', () => {
        expect(
            firmaValida({ signature: undefined, requestId: 'req-1', dataId: '123', secret: SECRETO }),
        ).toBe(false);
    });

    it('rechaza una firma con formato inesperado', () => {
        expect(
            firmaValida({ signature: 'cualquier-cosa', requestId: 'r', dataId: '1', secret: SECRETO }),
        ).toBe(false);
    });
});
