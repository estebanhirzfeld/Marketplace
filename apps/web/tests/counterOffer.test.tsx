import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * La contraoferta va en la moneda de la operación. Con la moneda fija en
 * dólares, toda contraoferta sobre un activo en pesos chocaba con el dominio:
 * «La contraoferta debe estar en ARS, la moneda de la negociación».
 */

const counterOfferApi = vi.fn();
const revalidatePath = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock('next/navigation', () => ({
    redirect: (url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
    },
}));
vi.mock('@/lib/guards', () => ({ requireSession: async () => ({ id: 'buyer' }) }));
vi.mock('@/lib/api', () => ({ api: () => ({ counterOffer: counterOfferApi }) }));

import { counterOffer } from '@/app/operaciones/actions';
import { CounterOfferForm } from '@/components/CounterOfferForm';

function formWith(amount: string): FormData {
    const form = new FormData();
    form.set('money', amount);
    return form;
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe('counterOffer', () => {
    it('propone en pesos cuando la operación es en pesos', async () => {
        counterOfferApi.mockResolvedValue(undefined);

        const result = await counterOffer('op1', 'ARS', {}, formWith('150000'));

        expect(counterOfferApi).toHaveBeenCalledWith('op1', {
            price: { cents: 15_000_000, currency: 'ARS' },
        });
        expect(result.ok).toBe(true);
        expect(result.message).toContain('150.000');
        expect(result.message).not.toContain('US$');
        expect(revalidatePath).toHaveBeenCalledWith('/operaciones/op1');
    });

    it('sigue proponiendo en dólares cuando la operación es en dólares', async () => {
        counterOfferApi.mockResolvedValue(undefined);

        const result = await counterOffer('op1', 'USD', {}, formWith('1200'));

        expect(counterOfferApi).toHaveBeenCalledWith('op1', {
            price: { cents: 120_000, currency: 'USD' },
        });
        expect(result.message).toContain('US$');
    });
});

describe('CounterOfferForm', () => {
    it('muestra la moneda de la operación en la etiqueta y en el monto sobre la mesa', () => {
        const html = renderToStaticMarkup(
            <CounterOfferForm action={async () => ({})} precioActual={150000} miParte="buyer" currency="ARS" />,
        );

        expect(html).toContain('Tu contraoferta (ARS)');
        expect(html).toContain('150.000');
        expect(html).not.toContain('US$');
    });

    it('con dólares muestra la etiqueta en dólares', () => {
        const html = renderToStaticMarkup(
            <CounterOfferForm action={async () => ({})} precioActual={1200} miParte="seller" currency="USD" />,
        );

        expect(html).toContain('Tu contraoferta (USD)');
        expect(html).toContain('US$');
    });
});
