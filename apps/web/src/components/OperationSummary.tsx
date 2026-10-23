import Link from 'next/link';
import type { MoneyDto, OperationRoleDto } from '@marketplace/api-contract';
import { money } from '@/lib/format';

interface Amounts {
    finalPrice?: MoneyDto;
    buyerPays?: MoneyDto;
    sellerReceives?: MoneyDto;
    platformEarns?: MoneyDto;
}

/** La diferencia entre dos montos de la misma moneda: la comisión de una parte. */
function difference(a: MoneyDto, b: MoneyDto): MoneyDto {
    return { cents: Math.abs(a.cents - b.cents), currency: a.currency };
}

/** Los renglones de montos que le importan a cada rol; el último es el suyo. */
function rowsFor(role: OperationRoleDto, amounts: Amounts): [string, MoneyDto][] {
    const { finalPrice, buyerPays, sellerReceives, platformEarns } = amounts;
    if (!finalPrice) return [];
    switch (role) {
        case 'buyer':
            return buyerPays
                ? [
                      ['Precio', finalPrice],
                      ['Comisión', difference(buyerPays, finalPrice)],
                      ['Pagarás', buyerPays],
                  ]
                : [['Precio', finalPrice]];
        case 'seller':
            return sellerReceives
                ? [
                      ['Precio', finalPrice],
                      ['Comisión', difference(finalPrice, sellerReceives)],
                      ['Recibirás', sellerReceives],
                  ]
                : [['Precio', finalPrice]];
        case 'platform': {
            const rows: [string, MoneyDto][] = [];
            if (buyerPays) rows.push(['El comprador paga', buyerPays]);
            if (sellerReceives) rows.push(['El vendedor recibe', sellerReceives]);
            rows.push(platformEarns ? ['Comisión', platformEarns] : ['Precio', finalPrice]);
            return rows;
        }
    }
}

function accountLabel(role: OperationRoleDto, assetType?: string): string {
    switch (role) {
        case 'buyer':
            return assetType === 'web' ? 'Recibirás el sitio en' : 'Recibirás el canal en';
        case 'seller':
            return 'Cobrarás en';
        case 'platform':
            return 'Entrega al comprador en';
    }
}

/**
 * El resumen fijo de una operación, al lado de la acción: los montos de quien
 * mira (el suyo, en negrita), la cuenta donde recibe o cobra, el contrato
 * firmado y la publicación. En el teléfono va debajo de la acción.
 */
export function OperationSummary({
    role,
    assetType,
    currentOffer,
    receivingAccount,
    contractHref,
    listingHref,
    ...amounts
}: Amounts & {
    role: OperationRoleDto;
    assetType?: string;
    /** La oferta sobre la mesa, mientras no hay precio acordado. */
    currentOffer?: MoneyDto;
    /** Dónde recibe el activo el comprador, o dónde cobra el vendedor. */
    receivingAccount?: string;
    /** El contrato tripartito, solo cuando está firmado. */
    contractHref?: string;
    listingHref: string;
}) {
    const rows = rowsFor(role, amounts);
    if (rows.length === 0 && currentOffer) rows.push(['Oferta actual', currentOffer]);

    return (
        <aside
            aria-label="Resumen de la operación"
            className="flex flex-col gap-4 rounded-[var(--radius-grande)] border border-[var(--color-borde-fuerte)] bg-[var(--color-superficie)] p-5 md:gap-[18px] md:p-7"
        >
            {rows.length > 0 && (
                <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-3 text-[15px]">
                    {rows.map(([label, value], i) => {
                        const own = i === rows.length - 1 && rows.length > 1;
                        return (
                            <div key={label} className="contents">
                                <dt className={own ? 'font-bold' : 'text-[var(--color-tenue)]'}>{label}</dt>
                                <dd className={`font-mono ${own ? 'font-bold' : ''}`}>{money(value)}</dd>
                            </div>
                        );
                    })}
                </dl>
            )}

            {receivingAccount && (
                <dl className="flex flex-col gap-1.5 border-t border-[var(--color-borde-fuerte)] pt-4 text-[14px]">
                    <dt className="text-[var(--color-tenue)]">{accountLabel(role, assetType)}</dt>
                    <dd className="break-all font-mono">{receivingAccount}</dd>
                </dl>
            )}

            <div className="flex flex-col border-t border-[var(--color-borde-fuerte)] pt-2.5">
                {contractHref && (
                    <Link href={contractHref} className="inline-flex min-h-11 items-center text-[15px] text-[var(--color-acento)]">
                        Ver el contrato firmado
                    </Link>
                )}
                <Link href={listingHref} className="inline-flex min-h-11 items-center text-[15px] text-[var(--color-acento)]">
                    Ver la publicación
                </Link>
            </div>
        </aside>
    );
}

/**
 * El monto que le importa a quien mira, al lado del nombre del activo: lo que
 * pagará el comprador, lo que recibirá el vendedor, o quién vende a quién y
 * por cuánto, para la plataforma.
 */
export function OperationHeadline({
    role,
    currentOffer,
    buyerName,
    sellerName,
    ...amounts
}: Amounts & {
    role: OperationRoleDto;
    currentOffer?: MoneyDto;
    buyerName: string;
    sellerName: string;
}) {
    const price = amounts.finalPrice ?? currentOffer;
    if (role === 'platform') {
        return (
            <span className="text-[15px] text-[var(--color-tenue)] md:text-[16px]">
                {sellerName} a {buyerName}
                {price && (
                    <>
                        {' · '}
                        <strong className="font-bold text-[var(--color-tinta)]">{money(price)}</strong>
                    </>
                )}
            </span>
        );
    }
    const [verb, amount] =
        role === 'buyer'
            ? ['Pagarás', amounts.buyerPays ?? price]
            : ['Recibirás', amounts.sellerReceives ?? price];
    if (!amount) return null;
    return (
        <span className="text-[15px] text-[var(--color-tenue)] md:text-[16px]">
            {amounts.finalPrice ? verb : 'Oferta actual'}{' '}
            <strong className="font-bold text-[var(--color-tinta)]">{money(amount)}</strong>
        </span>
    );
}
