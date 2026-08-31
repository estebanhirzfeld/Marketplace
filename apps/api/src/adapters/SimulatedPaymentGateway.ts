import { IOperationRepository } from '@marketplace/domain/src/ports/Repositories';
import {
    Checkout,
    CheckoutRequest,
    ExternalPayment,
    IPaymentGateway,
} from '@marketplace/domain/src/ports/IPaymentGateway';

/**
 * Cobro simulado, para poder recorrer el cierre de una operación sin tener
 * las credenciales de MercadoPago dadas de alta.
 *
 * Sigue la misma regla que la simulación de Google: NO es un adaptador
 * degradado que se enciende solo cuando falta una clave. Se activa con
 * `SIMULATE_PAYMENTS=true` y con nada más. Un pago inventado que se cuele en
 * producción sería peor que no cobrar: la operación avanzaría a
 * `payment_received` y la plataforma liquidaría al vendedor por plata que
 * nunca entró.
 *
 * Lo que se simula es la RESPUESTA de la pasarela, no las reglas. El caso de
 * uso corre entero: consulta el pago, exige que esté aprobado, busca la
 * operación por su referencia, y la entidad valida que el monto y la moneda
 * cierren. Un identificador que no lleve el prefijo devuelve `null`, igual que
 * un pago inexistente en la pasarela real.
 */

export const SIMULATED_PAYMENT_PREFIX = 'simulado-pago:';

/** El identificador transporta la operación, que es lo que la pasarela devolvería. */
export function simulatedPaymentFor(operationId: string): string {
    return `${SIMULATED_PAYMENT_PREFIX}${operationId}`;
}

function operationIdFrom(paymentId: string): string | null {
    return paymentId.startsWith(SIMULATED_PAYMENT_PREFIX)
        ? paymentId.slice(SIMULATED_PAYMENT_PREFIX.length)
        : null;
}

export class SimulatedPaymentGateway implements IPaymentGateway {
    /**
     * @param operationRepo de acá sale el monto. No se toma del checkout
     *   porque la pasarela real tampoco lo recuerda de ahí: informa lo que
     *   efectivamente se cobró, y es contra eso que la entidad compara.
     * @param apiUrl a dónde mandar al comprador. La página simulada vive en la
     *   API y no en la web porque el aviso de pago también entra por acá.
     */
    constructor(
        private readonly operationRepo: IOperationRepository,
        private readonly apiUrl: string,
    ) {}

    async createCheckout(request: CheckoutRequest): Promise<Checkout> {
        const externalId = simulatedPaymentFor(request.externalReference);
        return {
            url: `${this.apiUrl}/pagos/simulado/${encodeURIComponent(externalId)}`,
            externalId,
        };
    }

    async fetchPayment(externalId: string): Promise<ExternalPayment | null> {
        const operationId = operationIdFrom(externalId);
        if (!operationId) return null;

        const operation = await this.operationRepo.findById(operationId);
        if (!operation) return null;

        const buyerPays = operation.buyerPays;
        if (!buyerPays) return null;

        return {
            externalId,
            status: 'approved',
            method: 'account_money',
            amountCents: buyerPays.getCents(),
            currency: buyerPays.getCurrency(),
            externalReference: operationId,
        };
    }
}
