const DAY_MS = 24 * 60 * 60 * 1000;
const WAIT_DAYS = 7;

export type AccessCountdown = {
    /** Días que faltan, redondeados hacia arriba. */
    daysLeft: number;
    /** Segmentos ya transcurridos de la barra. */
    filled: number;
    total: number;
};

/**
 * Cuánto falta para la transferencia inmediata.
 *
 * Una fecha inválida o vencida cuenta como «ya pasó»: la barra nunca se sale
 * del rango, y la pantalla decide con `transferable` si muestra la espera.
 */
export function accessCountdown(transferableFrom: string, now: Date): AccessCountdown {
    const target = new Date(transferableFrom).getTime();
    const left = Number.isNaN(target) ? 0 : Math.ceil((target - now.getTime()) / DAY_MS);
    const daysLeft = Math.min(Math.max(left, 0), WAIT_DAYS);
    return { daysLeft, filled: WAIT_DAYS - daysLeft, total: WAIT_DAYS };
}
