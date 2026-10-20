/**
 * Puerto de cobro.
 *
 * Hay dos modos de cobro:
 *
 * - Sin split (el modo de siempre): la plataforma cobra a su propia cuenta y
 *   retiene los fondos ahí, y le liquida al vendedor a mano.
 * - Con split (`sellerAccessToken`): el cobro se crea a nombre del vendedor,
 *   Mercado Pago le acredita a él y la plataforma retiene su comisión con
 *   `marketplaceFeeCents`. No hay liquidación manual.
 *
 * En ninguno de los dos la pasarela es el mecanismo de custodia: la custodia es
 * la del ACTIVO, que la plataforma toma antes de que se cobre. Esa distinción no
 * es un detalle — la reserva con captura diferida de MercadoPago vence a los 7
 * días, y una operación sobre un canal de YouTube tarda como mínimo el doble por
 * las dos ventanas de propiedad que impone Google.
 */

export interface CheckoutRequest {
    /** Referencia propia que la pasarela devuelve intacta en el aviso. */
    externalReference: string;
    description: string;
    amountCents: number;
    currency: string;
    payerEmail: string;
    /**
     * Cobro con split: el token del VENDEDOR. La preferencia se crea a nombre
     * del vendedor y el pago vive en su cuenta. Sin él se cobra con las
     * credenciales de la plataforma.
     */
    sellerAccessToken?: string;
    /**
     * Comisión que retiene la plataforma, en centavos de la moneda del cobro.
     * Solo tiene sentido junto con `sellerAccessToken`.
     */
    marketplaceFeeCents?: number;
    /** Hasta cuándo se puede pagar con este link (la cotización congelada vence). */
    expiresAt?: Date;
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
     *
     * Un pago con split vive en la cuenta del vendedor: solo se puede consultar
     * con SU token, que se pasa en `options.accessToken`.
     */
    fetchPayment(externalId: string, options?: { accessToken?: string }): Promise<ExternalPayment | null>;
}
