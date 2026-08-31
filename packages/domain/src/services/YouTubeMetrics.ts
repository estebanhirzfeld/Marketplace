/**
 * Reglas de lectura de las métricas que devuelve la API de YouTube.
 *
 * Viven en el dominio y no en el adaptador porque no son detalle de
 * transporte: determinan si un dato declarado por el vendedor se puede dar por
 * consistente, y de eso depende qué le mostramos al comprador.
 */

/**
 * Recorta un entero a tres cifras significativas, siempre hacia abajo.
 *
 * Es lo que hace la API con `subscriberCount`: *"This value is rounded down to
 * three significant figures"*. Reproducirlo permite comparar sin inventar
 * tolerancias.
 */
export function floorToThreeSignificantFigures(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (value < 1000) return Math.floor(value);

    const digits = Math.floor(Math.log10(value)) + 1;
    const factor = 10 ** (digits - 3);

    return Math.floor(value / factor) * factor;
}

/**
 * Si el número declarado por el vendedor es compatible con el que informa la
 * API.
 *
 * Devuelve `undefined` —no `false`— cuando el canal oculta sus suscriptores:
 * sin dato no hay nada que comparar, y tratar la ausencia como desacuerdo
 * marcaría como sospechoso a cualquier canal que ejerza esa opción.
 */
export function subscribersAreConsistent(
    declared: number,
    reported: number | undefined,
): boolean | undefined {
    if (reported === undefined) return undefined;

    return floorToThreeSignificantFigures(declared) === reported;
}
