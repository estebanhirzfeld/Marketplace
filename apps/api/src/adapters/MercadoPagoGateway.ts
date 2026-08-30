import {
    Checkout,
    CheckoutRequest,
    ExternalPayment,
    ExternalPaymentStatus,
    IPaymentGateway,
} from '@marketplace/domain/src/ports/IPaymentGateway';

const PREFERENCES = 'https://api.mercadopago.com/checkout/preferences';
const PAYMENTS = 'https://api.mercadopago.com/v1/payments';

export interface MercadoPagoConfig {
    accessToken: string;
    /** A dónde vuelve el comprador después de pagar. */
    backUrl: string;
    /** A dónde avisa MercadoPago cuando el pago cambia de estado. */
    notificationUrl: string;
}

/**
 * Cobro con MercadoPago.
 *
 * La plataforma cobra a su propia cuenta y retiene los fondos ahí: la pasarela
 * es el medio de cobro, no el mecanismo de custodia. La reserva con captura
 * diferida vence a los 7 días y una operación sobre un canal tarda como mínimo
 * el doble, así que no sirve para sostener el escrow.
 *
 * Se aceptan todos los medios de pago, incluida tarjeta. La exposición al
 * contracargo se compensa con lo que la plataforma ya acumula: identidad
 * verificada, contrato firmado con huella e IP, y —lo más importante para una
 * disputa— la constancia de que el activo estaba en custodia antes del cobro.
 */
/*
 * TODO: liberación de fondos al vendedor. No está confirmado que MercadoPago
 * exponga una API de pagos salientes en Argentina; hasta verificarlo con la
 * cuenta de prueba, la transferencia se hace fuera de la plataforma y se
 * registra a mano.
 *
 * TODO: si alguna vez se restringen los medios de pago, va `excluded_payment_types`
 * en la preferencia. Falta confirmar la lista exacta de tipos válidos para
 * Argentina: las páginas de referencia devolvieron 404 al consultarlas.
 */
export class MercadoPagoGateway implements IPaymentGateway {
    constructor(
        private readonly config: MercadoPagoConfig,
        private readonly fetchImpl: typeof fetch = fetch,
    ) {}

    async createCheckout(request: CheckoutRequest): Promise<Checkout> {
        const respuesta = await this.fetchImpl(PREFERENCES, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${this.config.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                items: [
                    {
                        title: request.description,
                        quantity: 1,
                        currency_id: request.currency,
                        // MercadoPago trabaja en unidades, el dominio en centavos.
                        unit_price: request.amountCents / 100,
                    },
                ],
                payer: { email: request.payerEmail },
                external_reference: request.externalReference,
                back_urls: { success: this.config.backUrl, pending: this.config.backUrl, failure: this.config.backUrl },
                notification_url: this.config.notificationUrl,
            }),
        });

        const cuerpo = await comoJson<{ id?: unknown; init_point?: unknown }>(
            respuesta,
            'la preferencia de pago',
        );

        if (typeof cuerpo.init_point !== 'string' || typeof cuerpo.id !== 'string') {
            throw new Error('MercadoPago no devolvió un link de pago.');
        }

        return { url: cuerpo.init_point, externalId: cuerpo.id };
    }

    async fetchPayment(externalId: string): Promise<ExternalPayment | null> {
        const respuesta = await this.fetchImpl(`${PAYMENTS}/${encodeURIComponent(externalId)}`, {
            headers: {
                authorization: `Bearer ${this.config.accessToken}`,
                accept: 'application/json',
            },
        });

        if (respuesta.status === 404) return null;

        const p = await comoJson<{
            id?: unknown;
            status?: unknown;
            payment_type_id?: unknown;
            transaction_amount?: unknown;
            currency_id?: unknown;
            external_reference?: unknown;
        }>(respuesta, 'el pago');

        if (p.id === undefined || typeof p.external_reference !== 'string') return null;

        return {
            externalId: String(p.id),
            status: aEstado(p.status),
            method: typeof p.payment_type_id === 'string' ? p.payment_type_id : 'desconocido',
            // El monto viene en unidades con decimales; el sistema es en centavos.
            amountCents: Math.round(Number(p.transaction_amount) * 100),
            currency: typeof p.currency_id === 'string' ? p.currency_id : 'ARS',
            externalReference: p.external_reference,
        };
    }
}

/**
 * MercadoPago tiene más estados que los tres que al dominio le importan.
 * Cualquiera que no sea `approved` se trata como pendiente salvo los que son
 * definitivamente negativos: dar por aprobado algo que no lo está sería
 * entregar un activo sin haber cobrado.
 */
function aEstado(status: unknown): ExternalPaymentStatus {
    if (status === 'approved') return 'approved';
    if (status === 'rejected' || status === 'cancelled' || status === 'refunded') return 'rejected';
    return 'pending';
}

async function comoJson<T>(respuesta: Response, queSeConsultaba: string): Promise<T> {
    if (!respuesta.ok) {
        // El cuerpo del error puede traer el token: no se propaga.
        throw new Error(`MercadoPago respondió ${respuesta.status} al consultar ${queSeConsultaba}.`);
    }
    return (await respuesta.json()) as T;
}
