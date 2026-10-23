import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PaymentOptionsDto, PaymentReceiptDto } from '@marketplace/api-contract';
import { PaymentChoice, SellerPaymentWait, showSellerPaymentWait } from '@/components/PaymentChoice';
import { transferStage } from '@/components/PaymentFlow';
import { exactMoney } from '@/lib/format';

/**
 * El comprador llega una vez, con el activo en custodia, a pagar. Elige el
 * medio entre dos tarjetas y, si transfiere, sigue dos pasos: primero la
 * comisión, después el vendedor. Los tests fijan qué ve en cada estado, que un
 * medio no disponible esté deshabilitado de verdad, y que no se filtre
 * vocabulario del sistema.
 */

async function pagar() {}
async function subir() {
    return {};
}

const OPERACION = 'a1b2c3d4-0000-4000-8000-000000000001';
const INSTRUCCIONES = 'Banco Ejemplo\nCBU 0000000000000000000000\nTitular: Plataforma SA';

const DESTINOS: NonNullable<PaymentOptionsDto['transfer']['destinations']> = [
    {
        recipient: 'seller',
        amount: { cents: 950_000, currency: 'ARS' },
        bankAccount: { alias: 'vendedor.cuenta', holder: 'Ana Vendedora', holderTaxId: '20123456786' },
    },
    { recipient: 'platform', amount: { cents: 100_000, currency: 'ARS' }, instructions: INSTRUCCIONES },
];

function opciones(over: {
    mercadopago?: Partial<PaymentOptionsDto['mercadopago']>;
    transfer?: Partial<PaymentOptionsDto['transfer']>;
    amount?: PaymentOptionsDto['amount'];
}): PaymentOptionsDto {
    const amount = over.amount ?? { cents: 1_050_000, currency: 'ARS' };
    return {
        currency: amount.currency,
        amount,
        mercadopago: { available: true, chargedIn: 'ARS', converted: false, ...over.mercadopago },
        transfer: {
            available: true,
            instructions: INSTRUCCIONES,
            reference: OPERACION,
            destinations: DESTINOS,
            ...over.transfer,
        },
    };
}

function comprobante(
    recipient: 'seller' | 'platform',
    status: PaymentReceiptDto['status'],
    extra: Partial<PaymentReceiptDto> = {},
): PaymentReceiptDto {
    return { recipient, status, uploadedAt: '2026-10-22T12:00:00.000Z', contentType: 'image/png', ...extra };
}

function comprador(
    options?: PaymentOptionsDto,
    extra: {
        receipts?: PaymentReceiptDto[];
        initialView?: 'choose' | 'mercadopago' | 'transfer-intro';
        buyerPays?: { cents: number; currency: string };
    } = {},
) {
    return renderToStaticMarkup(
        <PaymentChoice
            options={options}
            buyerPays={extra.buyerPays}
            checkoutAction={pagar}
            receipts={extra.receipts}
            uploadActions={{ platform: subir, seller: subir }}
            initialView={extra.initialView}
        />,
    );
}

function vendedor(options?: PaymentOptionsDto) {
    return renderToStaticMarkup(<SellerPaymentWait options={options} />);
}

/** Si el botón que contiene esa etiqueta está deshabilitado de verdad. */
function deshabilitado(html: string, etiqueta: string): boolean {
    const boton = html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${etiqueta}`, 's'));
    expect(boton).not.toBeNull();
    return /^<button[^>]*\sdisabled(=""|\s|>)/.test(boton![0]);
}

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

/** Lo que una persona nunca debería leer. */
const VOCABULARIO_INTERNO =
    /gateway|pasarela|split|oauth|token|\bapi\b|quote|cotizaci[oó]n congelada|preferencia|\b503\b|INVALID_STATE|rate_unavailable|seller_not_linked|not_configured|seller_bank_missing|recipient/i;

describe('PaymentChoice — elegir el medio', () => {
    it('muestra las dos tarjetas, con el logo de Mercado Pago', () => {
        const html = comprador(opciones({}));

        expect(texto(html)).toContain('Mercado Pago');
        expect(html).toContain('src="/logos/mercadopago.svg"');
        expect(texto(html)).toContain('La acreditación es inmediata.');
        expect(texto(html)).toContain('Transferencia');
        expect(texto(html)).toContain('Desde tu banco, en dos transferencias. La confirmación es manual.');
        expect(deshabilitado(html, 'Pagar con Mercado Pago')).toBe(false);
        expect(deshabilitado(html, 'Pagar por transferencia')).toBe(false);
    });

    it('antes de elegir no muestra cuentas ni la referencia de la operación', () => {
        const t = texto(comprador(opciones({})));

        expect(t).not.toContain('vendedor.cuenta');
        expect(t).not.toContain(OPERACION);
    });

    it.each([
        ['seller_not_linked', 'El vendedor todavía no habilitó Mercado Pago.'],
        ['rate_unavailable', 'Mercado Pago no está disponible en este momento.'],
        ['not_configured', 'Mercado Pago no está disponible en este momento.'],
    ] as const)('Mercado Pago con %s queda deshabilitado con el motivo', (reason, motivo) => {
        const html = comprador(opciones({ mercadopago: { available: false, reason } }));

        expect(deshabilitado(html, motivo)).toBe(true);
        expect(deshabilitado(html, 'Pagar por transferencia')).toBe(false);
    });

    it('la transferencia no disponible queda deshabilitada', () => {
        const html = comprador(opciones({ transfer: { available: false, destinations: undefined } }));

        expect(deshabilitado(html, 'La transferencia no está disponible por ahora.')).toBe(true);
    });

    it('sin ningún medio lo dice una vez, sin pedirle un reclamo al comprador', () => {
        const html = comprador(
            opciones({
                mercadopago: { available: false, reason: 'not_configured' },
                transfer: { available: false, destinations: undefined },
            }),
        );

        expect(texto(html)).toContain('Por ahora no hay un medio de pago disponible.');
        expect(texto(html)).toContain('te avisaremos cuando puedas pagar');
        expect(texto(html)).not.toMatch(/reclamo/i);
        expect(html).not.toMatch(/<button/);
    });

    it('sin poder consultar las opciones queda el botón de pagar', () => {
        const html = comprador(undefined, { buyerPays: { cents: 1_050_000, currency: 'ARS' } });

        expect(texto(html)).toMatch(/Pagar AR\$/);
    });
});

describe('PaymentChoice — Mercado Pago', () => {
    it('explica la redirección y lleva a pagar', () => {
        const t = texto(comprador(opciones({}), { initialView: 'mercadopago' }));

        expect(t).toContain('Te redirigiremos a Mercado Pago para realizar el pago.');
        expect(t).toContain('Ir a Mercado Pago');
        expect(t).toContain('Elegir otro medio');
    });

    it('en una operación en dólares avisa la conversión a pesos', () => {
        const t = texto(
            comprador(opciones({ amount: { cents: 100_000, currency: 'USD' }, mercadopago: { converted: true } }), {
                initialView: 'mercadopago',
            }),
        );

        expect(t).toContain('Mercado Pago cobra en pesos');
    });
});

describe('PaymentChoice — transferencia', () => {
    it('antes de empezar dice que son dos, con sus montos, y que la revisión es manual', () => {
        const t = texto(comprador(opciones({}), { initialView: 'transfer-intro' }));

        expect(t).toContain('Realizarás 2 transferencias');
        expect(t).toContain(`La comisión, a la plataforma: ${exactMoney({ cents: 100_000, currency: 'ARS' })}`);
        expect(t).toContain(`El pago, al vendedor: ${exactMoney({ cents: 950_000, currency: 'ARS' })}`);
        expect(t).toContain('La revisión es manual y puede demorar: te avisaremos cuando estén confirmados.');
    });

    it('con la comisión enviada sigue el paso 2: la cuenta del vendedor, con su CUIT', () => {
        const t = texto(comprador(opciones({}), { receipts: [comprobante('platform', 'pending')] }));

        expect(t).toContain('Recibimos el comprobante de la comisión. Resta una transferencia: el pago al vendedor.');
        expect(t).toContain('PASO 2 DE 2');
        expect(t).toContain('El pago, al vendedor');
        expect(t).toContain(exactMoney({ cents: 950_000, currency: 'ARS' }));
        expect(t).toContain('vendedor.cuenta');
        expect(t).toContain('Ana Vendedora');
        expect(t).toContain('20123456786');
        expect(t).toContain('Adjuntar comprobante');
        // Con una transferencia hecha, Mercado Pago ya no se ofrece.
        expect(t).not.toContain('Pagar con Mercado Pago');
    });

    it('una comisión rechazada vuelve al paso 1, con el motivo', () => {
        const t = texto(
            comprador(opciones({}), {
                receipts: [
                    comprobante('platform', 'rejected', { rejectionCode: 'amount_mismatch', rejectionReason: 'Llegaron AR$ 90.000.' }),
                ],
            }),
        );

        expect(t).toContain('PASO 1 DE 2');
        expect(t).toContain('La plataforma rechazó el comprobante: El monto no coincide: Llegaron AR$ 90.000.');
        expect(t).toContain('Banco Ejemplo');
    });

    it('con la comisión en revisión, sigue el pago al vendedor: la revisión no tapa la otra transferencia', () => {
        const enRevision = comprobante('platform', 'in_review', {
            review: { stage: 'coherence', requestedBy: 'buyer', hasSellerStatement: false },
        });
        const t = texto(comprador(opciones({}), { receipts: [enRevision] }));

        expect(t).toContain('El comprobante está en revisión');
        expect(t).toContain('El pago, al vendedor');
        expect(t).toContain('Adjuntar comprobante');
    });

    it('con un comprobante en revisión y el otro enviado, solo queda esperar la revisión', () => {
        const enRevision = comprobante('seller', 'in_review', {
            review: { stage: 'awaiting_seller', requestedBy: 'buyer', hasSellerStatement: false },
        });
        const t = texto(comprador(opciones({}), { receipts: [comprobante('platform', 'pending'), enRevision] }));

        expect(t).toContain('El comprobante está en revisión');
        expect(t).not.toContain('Adjuntar comprobante');
        expect(t).not.toContain('Recibimos los dos comprobantes');
    });

    it('con los dos enviados, avisa que la revisión es manual', () => {
        const t = texto(
            comprador(opciones({}), { receipts: [comprobante('platform', 'pending'), comprobante('seller', 'pending')] }),
        );

        expect(t).toContain('Recibimos los dos comprobantes');
        expect(t).toContain('te avisaremos cuando el pago esté confirmado');
        expect(t).not.toContain('Adjuntar comprobante');
    });

    it('nunca muestra la referencia interna de la operación', () => {
        const estados = [
            comprador(opciones({}), { initialView: 'transfer-intro' }),
            comprador(opciones({}), { receipts: [comprobante('platform', 'pending')] }),
        ];
        for (const html of estados) expect(texto(html)).not.toContain(OPERACION);
    });
});

describe('transferStage', () => {
    it('primero la comisión, después el vendedor; un rechazado vuelve a pedirse', () => {
        expect(transferStage([])).toBe('platform');
        expect(transferStage([comprobante('platform', 'rejected')])).toBe('platform');
        expect(transferStage([comprobante('platform', 'pending')])).toBe('seller');
        expect(transferStage([comprobante('platform', 'confirmed'), comprobante('seller', 'rejected')])).toBe('seller');
        expect(transferStage([comprobante('platform', 'pending'), comprobante('seller', 'pending')])).toBe('done');
    });
});

describe('SellerPaymentWait', () => {
    it('es un panel tranquilo que dice que se espera el pago', () => {
        const html = vendedor(opciones({}));

        expect(texto(html)).toContain('Esperando el pago del comprador');
        expect(texto(html)).toContain('Te avisaremos cuando el comprador realice el pago.');
        expect(html).not.toMatch(/<button/);
        expect(html).not.toContain('Vincular Mercado Pago');
    });

    it('con la cuenta sin vincular avisa y lleva al perfil con un botón', () => {
        const html = vendedor(opciones({ mercadopago: { available: false, reason: 'seller_not_linked' } }));

        expect(texto(html)).toContain('Vincular Mercado Pago');
        expect(html).toContain('href="/perfil#mercadopago"');
        expect(texto(html)).toMatch(/solo podrá pagar por transferencia/i);
    });

    it.each(['rate_unavailable', 'not_configured'] as const)(
        'con %s no hay nada que el vendedor pueda hacer y no ofrece el enlace',
        (reason) => {
            const html = vendedor(opciones({ mercadopago: { available: false, reason } }));

            expect(html).not.toContain('/perfil#mercadopago');
            expect(texto(html)).toContain('Esperando el pago del comprador');
        },
    );

    it('sin poder consultar las opciones muestra solo la espera', () => {
        const html = vendedor(undefined);

        expect(texto(html)).toContain('Esperando el pago del comprador');
        expect(html).not.toContain('/perfil#mercadopago');
    });

    it('sin ningún medio y sin cuentas, le pide una de las dos con su enlace', () => {
        const html = vendedor(
            opciones({
                mercadopago: { available: false, reason: 'seller_not_linked' },
                transfer: { available: false, reason: 'seller_bank_missing', instructions: undefined, destinations: undefined },
            }),
        );

        expect(texto(html)).toContain('Decinos dónde cobrar');
        expect(html).toContain('href="/perfil#mercadopago"');
        expect(html).toContain('href="/perfil#cuenta-bancaria"');
        expect(texto(html)).not.toContain('Te avisaremos cuando el comprador realice el pago.');
    });

    it('sin Mercado Pago en la plataforma y sin cuenta bancaria, la tarea es declarar la cuenta', () => {
        const html = vendedor(
            opciones({
                mercadopago: { available: false, reason: 'not_configured' },
                transfer: { available: false, reason: 'seller_bank_missing', instructions: undefined, destinations: undefined },
            }),
        );

        expect(texto(html)).toContain('Decinos dónde cobrar');
        expect(html).toContain('href="/perfil#cuenta-bancaria"');
        expect(html).not.toContain('href="/perfil#mercadopago"');
    });

    it('con Mercado Pago disponible y sin cuenta bancaria, espera y avisa que solo podrá pagar así', () => {
        const html = vendedor(
            opciones({
                transfer: { available: false, reason: 'seller_bank_missing', instructions: undefined, destinations: undefined },
            }),
        );

        expect(texto(html)).toContain('Esperando el pago del comprador');
        expect(texto(html)).toMatch(/solo podrá pagar con Mercado Pago/);
        expect(html).toContain('href="/perfil#cuenta-bancaria"');
    });
});

describe('SellerPaymentWait — aviso de la comisión de Mercado Pago', () => {
    const AVISO = /Mercado Pago descontará su comisión/i;

    it('con Mercado Pago disponible explica la diferencia entre los dos medios de pago', () => {
        const t = texto(vendedor(opciones({})));

        expect(t).toMatch(AVISO);
        expect(t).toMatch(/acreditará el dinero en sus plazos/i);
        expect(t).toMatch(/por transferencia, recibirás el monto acordado/i);
    });

    it('con la cuenta sin vincular también avisa, porque vincularla es la decisión del vendedor', () => {
        expect(texto(vendedor(opciones({ mercadopago: { available: false, reason: 'seller_not_linked' } })))).toMatch(AVISO);
    });

    it.each(['rate_unavailable', 'not_configured'] as const)('con %s el aviso no aparece', (reason) => {
        expect(texto(vendedor(opciones({ mercadopago: { available: false, reason } })))).not.toMatch(AVISO);
    });

    it('no fija porcentajes ni cantidades de días: dependen del medio de pago', () => {
        const t = texto(vendedor(opciones({})));

        expect(t).not.toMatch(/\d\s?%|por ciento/);
        expect(t).not.toMatch(/\b\d+\s+(días|dias|horas)\b/i);
    });

    it('el comprador nunca lo ve', () => {
        const t = texto(comprador(opciones({})));

        expect(t).not.toMatch(AVISO);
        expect(t).not.toMatch(/recibirás el monto/i);
    });
});

describe('showSellerPaymentWait — quién lo ve y cuándo', () => {
    it('solo el vendedor, con el activo en custodia', () => {
        expect(showSellerPaymentWait({ status: 'asset_in_custody', miParte: 'seller', isAdmin: false })).toBe(true);
    });

    it.each(['contract_signed', 'transfer_in_progress', 'payment_received', 'completed', 'cancelled'] as const)(
        'no en %s',
        (status) => {
            expect(showSellerPaymentWait({ status, miParte: 'seller', isAdmin: false })).toBe(false);
        },
    );

    it('no para el comprador, ni para quien no es parte, ni para el administrador', () => {
        expect(showSellerPaymentWait({ status: 'asset_in_custody', miParte: 'buyer', isAdmin: false })).toBe(false);
        expect(showSellerPaymentWait({ status: 'asset_in_custody', miParte: undefined, isAdmin: false })).toBe(false);
        expect(showSellerPaymentWait({ status: 'asset_in_custody', miParte: 'seller', isAdmin: true })).toBe(false);
    });
});

describe('PaymentChoice — vocabulario', () => {
    it('ningún estado usa vocabulario del sistema ni promete "más rápido" o "más seguro"', () => {
        const estados = [
            comprador(opciones({})),
            comprador(opciones({ mercadopago: { available: false, reason: 'seller_not_linked' } })),
            comprador(opciones({}), { initialView: 'mercadopago' }),
            comprador(opciones({}), { initialView: 'transfer-intro' }),
            comprador(opciones({}), { receipts: [comprobante('platform', 'pending')] }),
            comprador(opciones({}), { receipts: [comprobante('platform', 'rejected', { rejectionCode: 'not_credited' })] }),
            comprador(opciones({}), { receipts: [comprobante('platform', 'pending'), comprobante('seller', 'pending')] }),
            vendedor(opciones({})),
            vendedor(opciones({ mercadopago: { available: false, reason: 'seller_not_linked' } })),
            vendedor(undefined),
        ];

        for (const html of estados) {
            expect(texto(html)).not.toMatch(VOCABULARIO_INTERNO);
            expect(texto(html)).not.toMatch(/m[aá]s r[aá]pid|m[aá]s segur/i);
        }
    });
});

describe('exactMoney', () => {
    it('muestra los centavos solo cuando los hay', () => {
        expect(exactMoney({ cents: 1_050_000, currency: 'ARS' })).toBe('AR$ 10.500');
        expect(exactMoney({ cents: 1_050_050, currency: 'ARS' })).toBe('AR$ 10.500,50');
        expect(exactMoney({ cents: 1_575_005, currency: 'USD' })).toBe('US$ 15.750,05');
    });
});
