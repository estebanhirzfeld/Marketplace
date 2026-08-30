import type { MoneyDto } from '@marketplace/api-contract';

/**
 * El dinero viaja en centavos enteros por todo el sistema. Formatearlo es
 * responsabilidad de la vista, y solo acá: si el día de mañana hay que
 * mostrar otra moneda o separadores distintos, se cambia en un lugar.
 */
export function money(m: MoneyDto): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: m.currency,
        maximumFractionDigits: 0,
    }).format(m.cents / 100);
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
    youtube: 'YOUTUBE',
    web: 'SITIO WEB',
    instagram: 'INSTAGRAM',
    tiktok: 'TIKTOK',
};

export function assetTypeLabel(assetType: string): string {
    return TIPOS[assetType] ?? assetType.toUpperCase();
}

/**
 * Extrae las métricas que se muestran en una tarjeta según el tipo de activo.
 * Solo lee campos públicos: los confidenciales ni llegan desde la API cuando
 * el listing es blind y no hay NDA firmado.
 */
export function cardMetrics(
    assetType: string,
    form: Record<string, unknown>,
): Array<[string, string]> {
    const num = (k: string) => (typeof form[k] === 'number' ? formatNumber(form[k] as number) : '—');
    const dinero = (k: string) =>
        typeof form[k] === 'number'
            ? money({ cents: form[k] as number, currency: String(form.currency ?? 'USD') })
            : '—';

    // La primera fila es el título de la tarjeta; el resto, métricas.
    switch (assetType) {
        case 'youtube':
            return [
                ['titulo', 'Canal de YouTube'],
                ['suscriptores', num('subscribers')],
                ['ingreso/mes', dinero('monthlyRevenueUsdCents')],
                ['país', String(form.audienceTopCountry ?? '—')],
            ];
        case 'web':
            return [
                ['titulo', 'Sitio web'],
                ['autoridad', num('domainAuthority')],
                ['ingreso/mes', dinero('monthlyRevenueUsdCents')],
            ];
        case 'instagram':
        case 'tiktok':
            return [
                ['titulo', assetType === 'instagram' ? 'Cuenta de Instagram' : 'Cuenta de TikTok'],
                ['seguidores', num('followers')],
                [
                    'engagement',
                    typeof form.engagementRate === 'number'
                        ? percentage(form.engagementRate as number)
                        : '—',
                ],
            ];
        default:
            return [['titulo', 'Activo digital']];
    }
}
