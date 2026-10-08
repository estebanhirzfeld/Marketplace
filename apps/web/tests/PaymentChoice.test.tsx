import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PaymentOptionsDto } from '@marketplace/api-contract';
import { PaymentChoice, SellerPaymentWait, showSellerPaymentWait } from '@/components/PaymentChoice';
import { exactMoney } from '@/lib/format';

/**
 * El comprador llega a esta pantalla una vez, a decidir CÓMO pagar, y se va
 * cuando pagó o cuando sabe exactamente cómo hacerlo. Los tests fijan que cada
 * estado diga lo que corresponde, que un botón deshabilitado lo esté de
 * verdad, que nunca haya dos opciones muertas y que no se filtre vocabulario
 * del sistema.
 */

async function pagar() {}

const OPERACION = 'a1b2c3d4-0000-4000-8000-000000000001';
const INSTRUCCIONES = 'Banco Ejemplo\nCBU 0000000000000000000000\nTitular: Plataforma SA';

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
            ...over.transfer,
        },
    };
}

function comprador(options?: PaymentOptionsDto, buyerPays?: { cents: number; currency: string }) {
    return renderToStaticMarkup(
        <PaymentChoice options={options} buyerPays={buyerPays} checkoutAction={pagar} />,
    );
}

function vendedor(options?: PaymentOptionsDto) {
    return renderToStaticMarkup(<SellerPaymentWait options={options} />);
}

/** El atributo real: la clase `disabled:` de Tailwind también contiene la palabra. */
function deshabilitado(html: string): boolean {
    return /<button[^>]*\sdisabled(=""|\s|>)/.test(html);
}

/** El botón de Mercado Pago, con su etiqueta. */
function botonMercadoPago(html: string): string {
    const boton = html.match(/<button[^>]*>[^<]*Pagar con Mercado Pago/);
    expect(boton).not.toBeNull();
    return boton![0];
}

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

/** Lo que una persona nunca debería leer. */
const VOCABULARIO_INTERNO =
    /gateway|pasarela|split|oauth|token|\bapi\b|quote|cotizaci[oó]n congelada|preferencia|\b503\b|INVALID_STATE|rate_unavailable|seller_not_linked|not_configured/i;

const NUNCA_PROMETER = /m[aá]s r[aá]pid|m[aá]s segur/i;

describe('PaymentChoice — comprador con las dos opciones', () => {
    it('presenta una sola decisión con las dos opciones', () => {
        const html = comprador(opciones({}));

        expect(html).toContain('Elegí cómo pagar');
        expect(html).toContain('Pagar con Mercado Pago');
        expect(html).toContain('Transferencia bancaria');
    });

    it('Mercado Pago es un envío real hacia la acción de pago, no deshabilitado', () => {
        const html = comprador(opciones({}));

        expect(html).toMatch(/<form/);
        expect(deshabilitado(botonMercadoPago(html))).toBe(false);
    });

    it('la transferencia muestra el monto exacto en la moneda de la operación', () => {
        const html = comprador(opciones({ amount: { cents: 1_575_050, currency: 'USD' } }));

        expect(texto(html)).toContain(exactMoney({ cents: 1_575_050, currency: 'USD' }));
        expect(texto(html)).toContain('15.750,50');
    });

    it('muestra las instrucciones respetando los saltos de línea', () => {
        const html = comprador(opciones({}));

        expect(html).toContain('Banco Ejemplo');
        expect(html).toContain('whitespace-pre-line');
        expect(html).toContain('Titular: Plataforma SA');
    });

    it('las instrucciones se muestran como texto, nunca como HTML', () => {
        const html = comprador(
            opciones({ transfer: { instructions: '<script>alert(1)</script><b>CBU</b>' } }),
        );

        // React agrega su propio <script> para reenviar formularios: lo que no
        // puede aparecer es el del texto cargado.
        expect(html).not.toContain('<script>alert(1)');
        expect(html).not.toContain('<b>CBU</b>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('pide indicar la referencia de la operación', () => {
        const html = comprador(opciones({}));

        expect(texto(html)).toContain(`Indicá esta referencia: ${OPERACION}`);
    });

    it('en pesos no habla de conversión', () => {
        const html = comprador(opciones({}));

        expect(texto(html)).not.toMatch(/cotizaci/i);
    });

    it('si se cobra convertida lo dice con palabras llanas y promete ver el monto antes de pagar', () => {
        const html = comprador(
            opciones({
                amount: { cents: 1_050_000, currency: 'USD' },
                mercadopago: { converted: true },
            }),
        );

        expect(texto(html)).toMatch(
            /se cobra en pesos, a la cotización oficial del día/i,
        );
        expect(texto(html)).toMatch(/vas a ver el monto en pesos antes de pagar/i);
    });
});

describe('PaymentChoice — Mercado Pago no disponible', () => {
    it('sin vendedor vinculado deshabilita el botón de verdad y ofrece la transferencia', () => {
        const html = comprador(
            opciones({ mercadopago: { available: false, reason: 'seller_not_linked' } }),
        );

        expect(deshabilitado(botonMercadoPago(html))).toBe(true);
        expect(texto(html)).toContain(
            'El vendedor todavía no habilitó Mercado Pago. Podés pagar por transferencia.',
        );
        // La transferencia sigue ahí.
        expect(html).toContain('Banco Ejemplo');
    });

    it.each(['rate_unavailable', 'not_configured'] as const)(
        'con %s dice que no está disponible por ahora y ofrece la transferencia',
        (reason) => {
            const html = comprador(opciones({ mercadopago: { available: false, reason } }));

            expect(deshabilitado(botonMercadoPago(html))).toBe(true);
            expect(texto(html)).toContain(
                'Mercado Pago no está disponible en este momento. Podés pagar por transferencia.',
            );
        },
    );

    it('el botón deshabilitado no está dentro de un formulario que envíe el pago', () => {
        const html = comprador(
            opciones({ mercadopago: { available: false, reason: 'not_configured' } }),
        );

        expect(html).not.toMatch(/<form/);
    });
});

describe('PaymentChoice — transferencia no disponible', () => {
    it('lo dice y manda al reclamo, mientras Mercado Pago sigue disponible', () => {
        const html = comprador(
            opciones({ transfer: { available: false, instructions: undefined } }),
        );

        expect(texto(html)).toMatch(/transferencia no está disponible por ahora/i);
        expect(texto(html)).toMatch(/abrí un reclamo más abajo/i);
        expect(html).not.toContain('Indicá esta referencia');
        expect(deshabilitado(botonMercadoPago(html))).toBe(false);
    });
});

describe('PaymentChoice — ninguna opción', () => {
    const ninguna = opciones({
        mercadopago: { available: false, reason: 'not_configured' },
        transfer: { available: false, instructions: undefined },
    });

    it('muestra un solo mensaje claro, sin dos opciones muertas', () => {
        const html = comprador(ninguna);

        expect(texto(html)).toMatch(/por ahora no podés pagar desde acá/i);
        expect(texto(html)).toMatch(/no perdiste nada/i);
        expect(texto(html)).toMatch(/abrí un reclamo más abajo/i);
        expect(html).not.toMatch(/<button/);
        expect(html).not.toContain('Transferencia bancaria');
        expect(html).not.toContain('Pagar con Mercado Pago');
    });
});

describe('PaymentChoice — opciones desconocidas', () => {
    it('si no se pudieron consultar cae al botón de pagar de siempre', () => {
        const html = comprador(undefined, { cents: 1_050_000, currency: 'ARS' });

        expect(html).toContain('<form');
        expect(texto(html)).toContain('Pagar AR$ 10.500');
        expect(html).not.toContain('Elegí cómo pagar');
        expect(deshabilitado(html)).toBe(false);
    });

    it('sin monto tampoco rompe', () => {
        const html = comprador(undefined, undefined);

        expect(html).toMatch(/<button/);
        expect(texto(html)).toContain('Pagar');
    });
});

describe('SellerPaymentWait', () => {
    it('es un panel tranquilo que dice que se espera el pago', () => {
        const html = vendedor(opciones({}));

        expect(texto(html)).toContain('Esperando el pago del comprador');
        expect(html).not.toMatch(/<button/);
        expect(html).not.toContain('Vincular Mercado Pago');
    });

    it('con la cuenta sin vincular avisa y lleva al perfil con un botón', () => {
        const html = vendedor(
            opciones({ mercadopago: { available: false, reason: 'seller_not_linked' } }),
        );

        expect(texto(html)).toContain('Vincular Mercado Pago');
        expect(html).toContain('href="/perfil#mercadopago"');
        expect(texto(html)).toMatch(/solo puede pagar por transferencia/i);
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
});

describe('SellerPaymentWait — aviso de la comisión de Mercado Pago', () => {
    const AVISO = /Mercado Pago descuenta su comisión/i;

    it('con Mercado Pago disponible explica la diferencia entre los dos medios de pago', () => {
        const t = texto(vendedor(opciones({})));

        expect(t).toMatch(AVISO);
        expect(t).toMatch(/acredita el dinero en sus plazos/i);
        expect(t).toMatch(/por transferencia cobrás el monto acordado/i);
    });

    it('con la cuenta sin vincular también avisa, porque vincularla es la decisión del vendedor', () => {
        const t = texto(
            vendedor(opciones({ mercadopago: { available: false, reason: 'seller_not_linked' } })),
        );

        expect(t).toMatch(AVISO);
    });

    it.each(['rate_unavailable', 'not_configured'] as const)(
        'con %s el comprador no puede pagar por ahí y el aviso no aparece',
        (reason) => {
            const t = texto(vendedor(opciones({ mercadopago: { available: false, reason } })));

            expect(t).not.toMatch(/comisión de Mercado Pago/i);
        },
    );

    it('sin poder consultar las opciones no aparece', () => {
        expect(texto(vendedor(undefined))).not.toMatch(/comisión de Mercado Pago/i);
    });

    it('no fija porcentajes ni cantidades de días: dependen del medio de pago', () => {
        const t = texto(vendedor(opciones({})));

        expect(t).not.toMatch(/\d\s?%|por ciento/);
        expect(t).not.toMatch(/\b\d+\s+(días|dias|horas)\b/i);
    });

    it('el comprador nunca lo ve', () => {
        const t = texto(comprador(opciones({})));

        expect(t).not.toMatch(/Mercado Pago descuenta/i);
        expect(t).not.toMatch(/cobrás/i);
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

    it('no para el comprador ni para quien no es parte', () => {
        expect(showSellerPaymentWait({ status: 'asset_in_custody', miParte: 'buyer', isAdmin: false })).toBe(false);
        expect(showSellerPaymentWait({ status: 'asset_in_custody', miParte: undefined, isAdmin: false })).toBe(false);
    });

    it('no para el administrador, aunque figure como parte', () => {
        expect(showSellerPaymentWait({ status: 'asset_in_custody', miParte: 'seller', isAdmin: true })).toBe(false);
        expect(showSellerPaymentWait({ status: 'asset_in_custody', miParte: undefined, isAdmin: true })).toBe(false);
    });
});

describe('PaymentChoice — vocabulario', () => {
    it('ningún estado usa vocabulario del sistema ni promete "más rápido" o "más seguro"', () => {
        const estados = [
            comprador(opciones({})),
            comprador(opciones({ mercadopago: { available: false, reason: 'seller_not_linked' } })),
            comprador(opciones({ mercadopago: { available: false, reason: 'rate_unavailable' } })),
            comprador(opciones({ mercadopago: { available: false, reason: 'not_configured' } })),
            comprador(opciones({ amount: { cents: 100_000, currency: 'USD' }, mercadopago: { converted: true } })),
            comprador(opciones({ transfer: { available: false, instructions: undefined } })),
            comprador(
                opciones({
                    mercadopago: { available: false, reason: 'not_configured' },
                    transfer: { available: false, instructions: undefined },
                }),
            ),
            comprador(undefined, { cents: 100, currency: 'ARS' }),
            vendedor(opciones({})),
            vendedor(opciones({ mercadopago: { available: false, reason: 'seller_not_linked' } })),
            vendedor(undefined),
        ];

        for (const html of estados) {
            expect(texto(html)).not.toMatch(VOCABULARIO_INTERNO);
            expect(texto(html)).not.toMatch(NUNCA_PROMETER);
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
