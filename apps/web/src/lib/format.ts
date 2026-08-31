import type { MoneyDto } from '@marketplace/api-contract';

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

const TIPOS: Record<string, string> = {
    youtube: 'CANAL DE YOUTUBE',
    web: 'SITIO WEB',
};

export function assetTypeLabel(assetType: string): string {
    return TIPOS[assetType] ?? assetType.toUpperCase();
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
 * Extrae las métricas que se muestran en una tarjeta según el tipo de activo.
 * Solo lee campos públicos: los confidenciales ni llegan desde la API cuando
 * el listing es blind y no hay NDA firmado.
 */
export function cardMetrics(
    assetType: string,
    data: Record<string, unknown>,
): Array<[string, string]> {
    const num = (k: string) => (typeof data[k] === 'number' ? formatNumber(data[k] as number) : '—');
    const dinero = (k: string) =>
        typeof data[k] === 'number'
            ? money({ cents: data[k] as number, currency: String(data.currency ?? 'USD') })
            : '—';

    // La primera fila es el título de la tarjeta; el resto, métricas.
    //
    // El título es el RUBRO y no el tipo de activo: el tipo ya está arriba, en
    // el sello de la tarjeta, y repetirlo dejaba "CANAL DE YOUTUBE" sobre
    // "Canal de YouTube" sin decir en ningún lado de qué trata el canal.
    switch (assetType) {
        case 'youtube':
            return [
                ['titulo', nicheLabel(data.niche)],
                ['suscriptores', num('subscribers')],
                ['ingreso/mes', dinero('monthlyRevenueUsdCents')],
                ['país', String(data.audienceTopCountry ?? '—')],
            ];
        case 'web':
            return [
                ['titulo', nicheLabel(data.niche)],
                ['autoridad', num('domainAuthority')],
                ['ingreso/mes', dinero('monthlyRevenueUsdCents')],
            ];
        default:
            return [['titulo', 'Activo digital']];
    }
}
