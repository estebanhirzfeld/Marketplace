import { Money } from './Money';
import { ExchangeRate } from '../ports/IExchangeRateProvider';
import { ValidationError } from '../errors/DomainError';

/** Cuánto dura una cotización antes de que haya que pedir otra tasa. */
export const QUOTE_TTL_MS = 24 * 60 * 60 * 1000;

export interface SettlementQuoteProps {
    rate: number;
    rateDate: string;
    source: ExchangeRate['source'];
    currency: 'ARS';
    buyerPaysCents: number;
    sellerReceivesCents: number;
    platformFeeCents: number;
    expiresAt: Date;
}

/** La cotización tal como se persiste: igual que las props, con `expiresAt` en ISO. */
export type SettlementQuoteSnapshot = Omit<SettlementQuoteProps, 'expiresAt'> & {
    expiresAt: string;
};

/**
 * Liquidación en pesos de una operación en otra moneda.
 *
 * Mercado Pago convierte a su propio cambio y cobra su comisión de marketplace
 * siempre en moneda local, así que la plataforma convierte antes y congela el
 * resultado. La comisión no se convierte aparte: es la diferencia entre lo que
 * paga el comprador y lo que recibe el vendedor, ya en pesos, de modo que el
 * redondeo lo absorbe la plataforma y los dos montos cierran al centavo.
 */
export class SettlementQuote {
    private constructor(private readonly props: SettlementQuoteProps) {}

    public static create(datos: {
        buyerPays: Money;
        sellerReceives: Money;
        exchangeRate: ExchangeRate;
        now: Date;
        ttlMs?: number;
    }): SettlementQuote {
        const { buyerPays, sellerReceives, exchangeRate, now, ttlMs = QUOTE_TTL_MS } = datos;
        const { rate } = exchangeRate;

        if (!Number.isFinite(rate) || rate <= 0) {
            throw new ValidationError('La tasa de cambio tiene que ser un número positivo.');
        }
        if (buyerPays.getCurrency() !== sellerReceives.getCurrency()) {
            throw new ValidationError('Los montos del comprador y del vendedor están en monedas distintas.');
        }
        if (buyerPays.getCurrency() !== 'USD') {
            throw new ValidationError(
                `Solo se cotizan operaciones en USD; esta está en ${buyerPays.getCurrency()}.`,
            );
        }

        const buyerPaysCents = Math.round(buyerPays.getCents() * rate);
        const sellerReceivesCents = Math.round(sellerReceives.getCents() * rate);
        const platformFeeCents = buyerPaysCents - sellerReceivesCents;
        if (platformFeeCents <= 0) {
            throw new ValidationError('La comisión de la plataforma en pesos tiene que ser positiva.');
        }

        return new SettlementQuote({
            rate,
            rateDate: exchangeRate.date,
            source: exchangeRate.source,
            currency: 'ARS',
            buyerPaysCents,
            sellerReceivesCents,
            platformFeeCents,
            expiresAt: new Date(now.getTime() + ttlMs),
        });
    }

    /** Rehidrata desde persistencia: no recalcula nada. */
    public static reconstitute(props: SettlementQuoteProps): SettlementQuote {
        return new SettlementQuote(props);
    }

    /** Forma persistible: solo números y strings, con la fecha en ISO. */
    public toSnapshot(): SettlementQuoteSnapshot {
        return { ...this.props, expiresAt: this.props.expiresAt.toISOString() };
    }

    /** Rehidrata desde la forma persistida por `toSnapshot()`. */
    public static fromSnapshot(snapshot: SettlementQuoteSnapshot): SettlementQuote {
        return new SettlementQuote({ ...snapshot, expiresAt: new Date(snapshot.expiresAt) });
    }

    public get rate(): number {
        return this.props.rate;
    }

    public get rateDate(): string {
        return this.props.rateDate;
    }

    public get source(): ExchangeRate['source'] {
        return this.props.source;
    }

    public get currency(): 'ARS' {
        return this.props.currency;
    }

    public get buyerPaysCents(): number {
        return this.props.buyerPaysCents;
    }

    public get sellerReceivesCents(): number {
        return this.props.sellerReceivesCents;
    }

    public get platformFeeCents(): number {
        return this.props.platformFeeCents;
    }

    public get expiresAt(): Date {
        return this.props.expiresAt;
    }

    public isExpired(now: Date): boolean {
        return now.getTime() >= this.props.expiresAt.getTime();
    }
}
