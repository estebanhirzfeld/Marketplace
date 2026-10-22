import { ValidationError } from '../errors/DomainError';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Argentina no tiene horario de verano: su hora es siempre UTC-3. */
const AR_OFFSET_MS = -3 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Los plazos del traspaso, en un solo lugar. */
export interface HandoverDeadlineConfig {
    /** Días desde la firma para que el vendedor ceda el activo. */
    sellerHandoverDays: number;
    /** Días hábiles desde la custodia para que el comprador pague. */
    buyerPaymentBusinessDays: number;
    /** Días desde el pago para que el vendedor entregue lo que no se comprueba solo. */
    sellerDeliveryDays: number;
    /** Días desde la última entrega para que el comprador confirme que recibió. */
    buyerConfirmationDays: number;
    /** Días hábiles para que el vendedor confirme que le llegó su transferencia. */
    sellerTransferConfirmationBusinessDays: number;
}

/** Los plazos decididos el 21/10/2026. */
export const DEFAULT_HANDOVER_DEADLINES: HandoverDeadlineConfig = {
    sellerHandoverDays: 10,
    buyerPaymentBusinessDays: 5,
    sellerDeliveryDays: 5,
    buyerConfirmationDays: 3,
    sellerTransferConfirmationBusinessDays: 2,
};

/** La fecha de calendario en Argentina de un instante, como `YYYY-MM-DD`. */
function argentineDate(at: Date): string {
    return new Date(at.getTime() + AR_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Días hábiles en Argentina: lunes a viernes, menos los feriados que se le
 * pasen como `YYYY-MM-DD`. Los feriados cambian por decreto cada año, así que
 * no se escriben acá: los configura quien arma el calendario.
 */
export class BusinessCalendar {
    private readonly holidays: ReadonlySet<string>;

    constructor(holidays: readonly string[]) {
        for (const h of holidays) {
            if (!ISO_DATE.test(h)) throw new ValidationError(`El feriado «${h}» no es una fecha YYYY-MM-DD.`);
        }
        this.holidays = new Set(holidays);
    }

    /** Si una fecha de calendario (`YYYY-MM-DD`) es hábil. */
    public isBusinessDay(date: string): boolean {
        const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
        return weekday !== 0 && weekday !== 6 && !this.holidays.has(date);
    }

    /**
     * El final del día hábil número `count` después de `from`, contando desde
     * el día siguiente. El plazo vence a las 23:59:59.999 de ese día, en
     * Argentina.
     */
    public endOfBusinessDays(from: Date, count: number): Date {
        let date = argentineDate(from);
        let remaining = count;
        while (remaining > 0) {
            date = new Date(new Date(`${date}T00:00:00Z`).getTime() + MS_PER_DAY).toISOString().slice(0, 10);
            if (this.isBusinessDay(date)) remaining -= 1;
        }
        return new Date(new Date(`${date}T00:00:00Z`).getTime() + MS_PER_DAY - 1 - AR_OFFSET_MS);
    }
}

/**
 * Cuándo vence cada plazo del traspaso, desde el hito que lo ancla. Puro: no
 * mira el reloj; quien llama decide si ya venció.
 */
export class HandoverDeadlines {
    constructor(
        private readonly config: HandoverDeadlineConfig = DEFAULT_HANDOVER_DEADLINES,
        private readonly calendar: BusinessCalendar = new BusinessCalendar([]),
    ) {}

    public sellerHandover(signedAt: Date): Date {
        return this.addDays(signedAt, this.config.sellerHandoverDays);
    }

    public buyerPayment(custodyAt: Date): Date {
        return this.calendar.endOfBusinessDays(custodyAt, this.config.buyerPaymentBusinessDays);
    }

    public sellerDelivery(paidAt: Date): Date {
        return this.addDays(paidAt, this.config.sellerDeliveryDays);
    }

    public buyerConfirmation(lastDeliveryAt: Date): Date {
        return this.addDays(lastDeliveryAt, this.config.buyerConfirmationDays);
    }

    public sellerTransferConfirmation(receiptUploadedAt: Date): Date {
        return this.calendar.endOfBusinessDays(receiptUploadedAt, this.config.sellerTransferConfirmationBusinessDays);
    }

    private addDays(from: Date, days: number): Date {
        return new Date(from.getTime() + days * MS_PER_DAY);
    }
}
