/**
 * Puerto de cobro.
 *
 * La plataforma cobra a su propia cuenta y retiene los fondos ahí: eso ES el
 * escrow. La pasarela es un medio de cobro, no el mecanismo de custodia, y esa
 * distinción no es un detalle — la reserva con captura diferida de MercadoPago
 * vence a los 7 días, y una operación sobre un canal de YouTube tarda como
 * mínimo el doble por las dos ventanas de propiedad que impone Google.
 */

export interface CheckoutRequest {
    /** Referencia propia que la pasarela devuelve intacta en el aviso. */
    externalReference: string;
    description: string;
    amountCents: number;
    currency: string;
    payerEmail: string;
}

export interface Checkout {
    /** A dónde mandar al comprador para que pague. */
    url: string;
    /** El id de la preferencia en la pasarela, para reconciliar después. */
    externalId: string;
}

export type ExternalPaymentStatus = 'approved' | 'pending' | 'rejected';

export interface ExternalPayment {
    externalId: string;
    status: ExternalPaymentStatus;
    /** Con qué se pagó: `credit_card`, `account_money`, `bank_transfer`… */
    method: string;
    amountCents: number;
    currency: string;
    externalReference: string;
}

export interface IPaymentGateway {
    createCheckout(request: CheckoutRequest): Promise<Checkout>;

    /**
     * Consulta un pago contra la pasarela.
     *
     * Existe porque el cuerpo de un aviso no se cree nunca: del webhook se toma
     * el identificador y nada más, y el estado real se pregunta con nuestras
     * propias credenciales. Un aviso falsificado no puede, entonces, hacer más
     * que provocar una consulta.
     */
    fetchPayment(externalId: string): Promise<ExternalPayment | null>;
}
