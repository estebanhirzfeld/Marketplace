/**
 * Las columnas de dinero son `BigInt` en Postgres y `number` en el dominio.
 * Esta es la única frontera donde se convierte: ni las entidades ni la API
 * conocen `bigint` (JSON no lo serializa).
 */

/** Centavos del dominio -> valor de la columna. */
export function centsToColumn(cents: number): bigint {
    if (!Number.isSafeInteger(cents)) {
        throw new RangeError(`Monto fuera del rango seguro para guardar: ${cents}`);
    }
    return BigInt(cents);
}

/** Valor de la columna -> centavos del dominio. */
export function columnToCents(value: bigint): number {
    const cents = Number(value);
    if (!Number.isSafeInteger(cents)) {
        throw new RangeError(`Columna de dinero corrupta: ${value} excede el rango seguro.`);
    }
    return cents;
}

/** Variantes para columnas opcionales: `null` se conserva como ausencia. */
export function centsToColumnOrNull(cents: number | undefined | null): bigint | null {
    return cents === undefined || cents === null ? null : centsToColumn(cents);
}

export function columnToCentsOrUndefined(value: bigint | null): number | undefined {
    return value === null ? undefined : columnToCents(value);
}
