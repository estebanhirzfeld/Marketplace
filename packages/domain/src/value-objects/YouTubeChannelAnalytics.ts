import { ValidationError } from '../errors/DomainError';

/** Un mes de la serie que informa YouTube Analytics. */
export interface MonthlyAnalytics {
    /** `YYYY-MM`. */
    month: string;
    views: number;
    subscribersGained: number;
    subscribersLost: number;
    /** Ingreso estimado del mes, en centavos de dólar. */
    revenueCents: number;
}

export interface YouTubeChannelAnalyticsProps {
    channelId: string;
    title: string;
    thumbnailUrl?: string;
    subscribers: number;
    /** Vistas de los últimos 12 meses. */
    views12Months: number;
    /** Ingreso estimado de los últimos 12 meses, en centavos de dólar. */
    revenue12MonthsCents: number;
    monthly: MonthlyAnalytics[];
    /** País con más vistas en el período. Ausente si Google no informó ninguno. */
    topCountry?: string;
    periodStart: Date;
    periodEnd: Date;
    readAt: Date;
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Cuántos meses completos promedian el ingreso mensual. */
const AVERAGE_MONTHS = 3;

/**
 * Lo que Google dijo de un canal en un momento dado (snapshot inmutable).
 *
 * Es la fuente de los datos verificados del activo: suscriptores, ingreso y
 * país salen de acá y no del vendedor. El dinero va en centavos enteros, como
 * `Money`.
 */
export class YouTubeChannelAnalytics {
    private constructor(private readonly props: YouTubeChannelAnalyticsProps) {}

    public static create(props: YouTubeChannelAnalyticsProps): YouTubeChannelAnalytics {
        if (props.channelId.trim() === '') {
            throw new ValidationError('El identificador del canal es obligatorio.');
        }
        if (props.title.trim() === '') {
            throw new ValidationError('El título del canal es obligatorio.');
        }
        assertNonNegativeInteger(props.subscribers, 'Los suscriptores');
        assertNonNegativeInteger(props.views12Months, 'Las vistas de 12 meses');
        assertNonNegativeInteger(props.revenue12MonthsCents, 'Los ingresos de 12 meses');
        for (const date of [props.periodStart, props.periodEnd, props.readAt]) {
            if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
                throw new ValidationError('Las fechas de la lectura de YouTube no son válidas.');
            }
        }

        for (const entry of props.monthly) {
            if (!MONTH_PATTERN.test(entry.month)) {
                throw new ValidationError(`El mes "${entry.month}" no tiene el formato AAAA-MM.`);
            }
            assertNonNegativeInteger(entry.views, 'Las vistas del mes');
            assertNonNegativeInteger(entry.subscribersGained, 'Los suscriptores ganados del mes');
            assertNonNegativeInteger(entry.subscribersLost, 'Los suscriptores perdidos del mes');
            assertNonNegativeInteger(entry.revenueCents, 'Los ingresos del mes');
        }

        // Copia ordenada: la serie no depende del orden en que la entregue el lector.
        const monthly = [...props.monthly]
            .map((m) => ({ ...m }))
            .sort((a, b) => a.month.localeCompare(b.month));
        return new YouTubeChannelAnalytics({ ...props, monthly });
    }

    public get channelId(): string { return this.props.channelId; }
    public get title(): string { return this.props.title; }
    public get thumbnailUrl(): string | undefined { return this.props.thumbnailUrl; }
    public get subscribers(): number { return this.props.subscribers; }
    public get views12Months(): number { return this.props.views12Months; }
    public get revenue12MonthsCents(): number { return this.props.revenue12MonthsCents; }
    public get topCountry(): string | undefined { return this.props.topCountry; }
    public get periodStart(): Date { return this.props.periodStart; }
    public get periodEnd(): Date { return this.props.periodEnd; }
    public get readAt(): Date { return this.props.readAt; }

    /** Copia, para que nadie altere la serie guardada. */
    public get monthly(): MonthlyAnalytics[] {
        return this.props.monthly.map((m) => ({ ...m }));
    }

    /**
     * Ingreso mensual para valuar: promedio de los últimos 3 meses COMPLETOS.
     *
     * El mes de la lectura está a medias y bajaría el promedio, así que se
     * descarta. Con menos de 3 meses completos se promedian los que haya; sin
     * ninguno, cero. El resultado se redondea a centavos enteros.
     */
    public monthlyRevenueCents(): number {
        const readMonth = this.props.readAt.toISOString().slice(0, 7);
        const completeMonths = this.props.monthly
            .filter((m) => m.month < readMonth)
            .slice(-AVERAGE_MONTHS);
        if (completeMonths.length === 0) return 0;

        const total = completeMonths.reduce((sum, m) => sum + m.revenueCents, 0);
        return Math.round(total / completeMonths.length);
    }

    /** Monetizado se deduce de los ingresos: nadie lo declara. */
    public isMonetized(): boolean {
        return this.props.revenue12MonthsCents > 0;
    }
}

function assertNonNegativeInteger(value: number, name: string): void {
    if (!Number.isInteger(value) || value < 0) {
        throw new ValidationError(`${name} deben ser un número entero no negativo (dinero en centavos).`);
    }
}
