/**
 * Puerto de cotización.
 *
 * Mercado Pago cobra en pesos, así que una operación en dólares hay que
 * pesificarla por cuenta de la plataforma, con una tasa conocida de antemano.
 */

export interface ExchangeRate {
    /** Pesos por dólar. */
    rate: number;
    /** Día de publicación de la tasa, `YYYY-MM-DD`. */
    date: string;
    source: 'BCRA_A3500' | 'manual';
}

export interface IExchangeRateProvider {
    /** `null` si no hay ninguna tasa disponible en este momento. */
    getUsdArsRate(): Promise<ExchangeRate | null>;
}
