'use client';

import { useState } from 'react';
import type { MoneyDto } from '@marketplace/api-contract';
import { PriceSection } from '@/components/PriceSection';

/** Muestra el precio con su referencia en un estado fijo, sin salir de `/sistema`. */
export function PriceSectionDemo({
    initialCurrency,
    initialPrice,
    estimated,
}: {
    initialCurrency: string;
    initialPrice: string;
    estimated: MoneyDto | null;
}) {
    const [currency, setCurrency] = useState(initialCurrency);
    const [price, setPrice] = useState(initialPrice);

    return (
        <PriceSection
            currency={currency}
            onCurrencyChange={setCurrency}
            price={price}
            onPriceChange={setPrice}
            estimated={estimated}
        />
    );
}
