import type { AssetFieldKindDto, MoneyDto } from '@marketplace/api-contract';

/**
 * El símbolo se pone acá y no lo elige `Intl`.
 *
 * Con `style: 'currency'` en es-AR, los pesos salían como `$ 9.750.000` a secas
 * mientras los dólares salían `US$ 29.000`. En un mercado que mezcla las dos
 * monedas eso es una trampa: el precio más grande de la grilla parecía el más
 * caro cuando era el más barato. Prefijar las dos deja la comparación honesta.
 */
const SIMBOLOS: Record<string, string> = {
    USD: 'US$',
    ARS: 'AR$',
};

/**
 * El dinero viaja en centavos enteros por todo el sistema. Formatearlo es
 * responsabilidad de la vista, y solo acá: si el día de mañana hay que
 * mostrar otra moneda o separadores distintos, se cambia en un lugar.
 */
export function money(m: MoneyDto): string {
    const simbolo = SIMBOLOS[m.currency] ?? m.currency;
    const numero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(
        m.cents / 100,
    );
    return `${simbolo} ${numero}`;
}

/** Sin símbolo de moneda, para tablas densas. */
export function shortMoney(m: MoneyDto): string {
    return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(m.cents / 100);
}

export function formatNumber(n: number): string {
    return new Intl.NumberFormat('es-AR').format(n);
}

export function percentage(n: number): string {
    return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(n)} %`;
}

/**
 * Una fecha escrita como se lee en voz alta. Se usa donde la fecha es la
 * explicación de por qué algo todavía no se puede hacer: ahí un `12/9/2026`
 * obliga a descifrar, y el punto es que se entienda de una.
 */
export function fechaLarga(iso: string): string {
    return new Date(iso).toLocaleDateString('es-AR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

/**
 * El rubro viaja como código en inglés y se muestra en castellano. La lista es
 * cerrada, así que el mapa la cubre entera; el respaldo es para una publicación
 * vieja con un valor que ya no existe.
 */
const RUBROS: Record<string, string> = {
    gaming: 'Gaming',
    finance: 'Finanzas',
    technology: 'Tecnología',
    education: 'Educación',
    entertainment: 'Entretenimiento',
    health: 'Salud y fitness',
    lifestyle: 'Estilo de vida',
    news: 'Noticias',
    food: 'Cocina y gastronomía',
    travel: 'Viajes',
    business: 'Negocios',
    other: 'Otro',
};

export function nicheLabel(niche: unknown): string {
    return typeof niche === 'string' ? (RUBROS[niche] ?? 'Otro') : 'Otro';
}

/**
 * Escribe el valor de un campo según lo que su tipo de activo dijo que es.
 *
 * Antes había acá un mapa de claves —`monthlyRevenueUsdCents` es dinero,
 * `niche` es un rubro— que duplicaba lo que cada estrategia ya sabía de sus
 * propios campos, y que se desactualizaba solo: un campo nuevo salía a
 * pantalla con su nombre técnico y su valor crudo. Ahora el tipo de dato viaja
 * en el descriptor y acá queda únicamente el formato, que sí es de la vista.
 */
export function fieldValue(kind: AssetFieldKindDto, value: unknown): string {
    if (value === undefined || value === null || value === '') return '—';

    switch (kind) {
        case 'money':
            return typeof value === 'number' ? money({ cents: value, currency: 'USD' }) : String(value);
        case 'number':
            return typeof value === 'number' ? formatNumber(value) : String(value);
        case 'percentage':
            return typeof value === 'number' ? percentage(value) : String(value);
        case 'boolean':
            return value ? 'Sí' : 'No';
        case 'niche':
            return nicheLabel(value);
        default:
            return String(value);
    }
}
