/**
 * Tope, en centavos, de cualquier monto que entra por la API: 10^13 centavos
 * son $100.000.000.000. Está muy por debajo de lo que el dominio acepta
 * (`Number.MAX_SAFE_INTEGER`), así que las comisiones del 5% y las sumas del
 * comprador tampoco se pasan, y un valor absurdo es un 400 de validación y no
 * un 500 de la base.
 */
export const MAX_MONEY_CENTS = 10_000_000_000_000;
