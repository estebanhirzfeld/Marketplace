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

    /**
     * Sin `auto_return` Checkout Pro deja al comprador en la pantalla de MP con
     * un botón para volver: el pago se aprueba pero nadie lo devuelve al sitio.
     */
    it('vuelve al sitio automáticamente cuando el pago se aprueba', async () => {
        const impl = vi.fn().mockResolvedValueOnce(PREFERENCIA());
        const backUrl = 'https://traspaso.example/operaciones';
        const gateway = new MercadoPagoGateway({ ...CONFIG, backUrl }, impl);

        await gateway.createCheckout({
            externalReference: 'op-1',
            description: 'Compra',
            amountCents: 1_050_000,
            currency: 'ARS',
            payerEmail: 'comprador@example.com',
        });

        const cuerpo = JSON.parse(impl.mock.calls[0][1].body);
        expect(cuerpo.auto_return).toBe('approved');
        expect(cuerpo.back_urls.success).toBe(backUrl);
    });

    it('no pide la vuelta automática con una dirección que no es https', async () => {
        const { gateway, impl } = armar(PREFERENCIA());

        await gateway.createCheckout({
            externalReference: 'op-1',
            description: 'Compra',
            amountCents: 1_050_000,
            currency: 'ARS',
            payerEmail: 'comprador@example.com',
        });

        const cuerpo = JSON.parse(impl.mock.calls[0][1].body);
        expect(cuerpo.auto_return).toBeUndefined();
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

describe('MercadoPagoGateway — cobro con split', () => {
    const TOKEN_VENDEDOR = 'APP_USR-token-del-vendedor';
    const PREFERENCIA = () => json({ id: 'pref-1', init_point: 'https://mp/checkout/pref-1' });
    const BASE = {
        externalReference: 'op-1',
        description: 'Compra',
        amountCents: 157_500_000,
        currency: 'ARS',
        payerEmail: 'comprador@example.com',
    };

    it('crea la preferencia con el token del vendedor y nunca envía el de la plataforma', async () => {
        const { gateway, impl } = armar(PREFERENCIA());

        await gateway.createCheckout({
            ...BASE,
            sellerAccessToken: TOKEN_VENDEDOR,
            marketplaceFeeCents: 15_200,
        });

        const [url, init] = impl.mock.calls[0];
        expect(url).toBe('https://api.mercadopago.com/checkout/preferences');
        expect(init.headers.authorization).toBe(`Bearer ${TOKEN_VENDEDOR}`);
        // El token de la plataforma no viaja en ningún lado del pedido.
        expect(JSON.stringify(init)).not.toContain(CONFIG.accessToken);
    });

    it('convierte la comisión de centavos a pesos con decimales', async () => {
        const { gateway, impl } = armar(PREFERENCIA());

        await gateway.createCheckout({
            ...BASE,
            sellerAccessToken: TOKEN_VENDEDOR,
            marketplaceFeeCents: 15_200,
        });

        const cuerpo = JSON.parse(impl.mock.calls[0][1].body);
        expect(cuerpo.marketplace_fee).toBe(152);
        expect(typeof cuerpo.marketplace_fee).toBe('number');
        expect(cuerpo.items[0].unit_price).toBe(1_575_000);
    });

    it('conserva los centavos de la comisión', async () => {
        const { gateway, impl } = armar(PREFERENCIA());

        await gateway.createCheckout({
            ...BASE,
            sellerAccessToken: TOKEN_VENDEDOR,
            marketplaceFeeCents: 15_205,
        });

        expect(JSON.parse(impl.mock.calls[0][1].body).marketplace_fee).toBe(152.05);
    });

    it('con vencimiento agrega expires y expiration_date_to', async () => {
        const { gateway, impl } = armar(PREFERENCIA());
        const expiresAt = new Date('2026-10-06T12:00:00.000Z');

        await gateway.createCheckout({
            ...BASE,
            sellerAccessToken: TOKEN_VENDEDOR,
            marketplaceFeeCents: 15_200,
            expiresAt,
        });

        const cuerpo = JSON.parse(impl.mock.calls[0][1].body);
        expect(cuerpo.expires).toBe(true);
        expect(cuerpo.expiration_date_to).toBe('2026-10-06T12:00:00.000Z');
    });

    it('sin vencimiento no manda campos de expiración', async () => {
        const { gateway, impl } = armar(PREFERENCIA());

        await gateway.createCheckout({
            ...BASE,
            sellerAccessToken: TOKEN_VENDEDOR,
            marketplaceFeeCents: 15_200,
        });

        const cuerpo = JSON.parse(impl.mock.calls[0][1].body);
        expect(cuerpo).not.toHaveProperty('expires');
        expect(cuerpo).not.toHaveProperty('expiration_date_to');
    });

    it('sin token del vendedor ignora la comisión y el vencimiento', async () => {
        const { gateway, impl } = armar(PREFERENCIA());

        await gateway.createCheckout({
            ...BASE,
            marketplaceFeeCents: 15_200,
            expiresAt: new Date('2026-10-06T12:00:00.000Z'),
        });

        const [, init] = impl.mock.calls[0];
        const cuerpo = JSON.parse(init.body);
        expect(init.headers.authorization).toBe(`Bearer ${CONFIG.accessToken}`);
        expect(cuerpo).not.toHaveProperty('marketplace_fee');
        expect(cuerpo).not.toHaveProperty('expires');
    });

    it('el pedido sin split queda exactamente como antes', async () => {
        const { gateway, impl } = armar(PREFERENCIA());

        await gateway.createCheckout(BASE);

        const [url, init] = impl.mock.calls[0];
        expect(url).toBe('https://api.mercadopago.com/checkout/preferences');
        expect(init).toEqual({
            method: 'POST',
            headers: {
                authorization: `Bearer ${CONFIG.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                items: [{ title: 'Compra', quantity: 1, currency_id: 'ARS', unit_price: 1_575_000 }],
                payer: { email: 'comprador@example.com' },
                external_reference: 'op-1',
                back_urls: {
                    success: CONFIG.backUrl,
                    pending: CONFIG.backUrl,
                    failure: CONFIG.backUrl,
                },
                notification_url: CONFIG.notificationUrl,
            }),
        });
    });

    it('consulta el pago con el token del vendedor cuando se lo pasan', async () => {
        const { gateway, impl } = armar(
            json({
                id: 1,
                status: 'approved',
                payment_type_id: 'credit_card',
                transaction_amount: 1_575_000,
                currency_id: 'ARS',
                external_reference: 'op-1',
            }),
        );

        const pago = await gateway.fetchPayment('1', { accessToken: TOKEN_VENDEDOR });

        const [, init] = impl.mock.calls[0];
        expect(init.headers.authorization).toBe(`Bearer ${TOKEN_VENDEDOR}`);
        expect(JSON.stringify(init)).not.toContain(CONFIG.accessToken);
        expect(pago?.amountCents).toBe(157_500_000);
    });

    it('consulta el pago con el token de la plataforma si no hay otro', async () => {
        const { gateway, impl } = armar(json({}, 404));

        await gateway.fetchPayment('1');

        expect(impl.mock.calls[0][1].headers.authorization).toBe(`Bearer ${CONFIG.accessToken}`);
    });

    it('no filtra el token del vendedor cuando Mercado Pago rechaza el pedido', async () => {
        const { gateway } = armar(json({ message: TOKEN_VENDEDOR }, 401));

        const error = await gateway
            .createCheckout({ ...BASE, sellerAccessToken: TOKEN_VENDEDOR, marketplaceFeeCents: 15_200 })
            .catch((e: unknown) => e);

        expect((error as Error).message).not.toContain(TOKEN_VENDEDOR);
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
