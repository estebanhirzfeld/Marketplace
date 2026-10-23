import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiError } from '@marketplace/api-client';

/*
 * El vendedor dice dónde cobrar cuando el comprador paga por transferencia:
 * una cuenta por moneda, con un CBU o un alias. Con la cuenta guardada se ve
 * cuál es y se puede cambiar.
 */

const declareBankAccount = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
    redirect: (url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
    },
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }) }));
vi.mock('@/lib/guards', () => ({ requireCounterparty: async () => ({ id: 'seller' }) }));
vi.mock('@/lib/api', () => ({ api: () => ({ declareBankAccount }) }));

import { BankAccountsView } from '@/components/BankAccountSection';
import { declareBankAccountAction } from '@/app/perfil/actions';

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

const noop = async () => ({});

beforeEach(() => {
    vi.resetAllMocks();
});

describe('BankAccountsView', () => {
    it('sin cuentas, pide una para pesos y otra para dólares', () => {
        const html = renderToStaticMarkup(<BankAccountsView accounts={[]} actionFor={() => noop} />);

        expect(texto(html)).toContain('DÓNDE COBRÁS POR TRANSFERENCIA');
        expect(texto(html)).toContain('EN PESOS');
        expect(texto(html)).toContain('EN DÓLARES');
        expect(html.match(/name="destination"/g)).toHaveLength(2);
        expect(html.match(/name="holder"/g)).toHaveLength(2);
    });

    it('con la cuenta guardada, la muestra y deja cambiarla', () => {
        const html = renderToStaticMarkup(
            <BankAccountsView
                accounts={[{ currency: 'ARS', alias: 'delia.pesos', holder: 'Delia Orrego', declaredAt: '2026-10-22T10:00:00.000Z' }]}
                actionFor={() => noop}
            />,
        );

        expect(texto(html)).toContain('delia.pesos');
        expect(texto(html)).toContain('Delia Orrego');
        expect(texto(html)).toContain('Cambiar la cuenta');
    });

    it('una cuenta sin CUIT pide completarlo, porque sin él no se puede pagar por transferencia', () => {
        const html = renderToStaticMarkup(
            <BankAccountsView
                accounts={[{ currency: 'ARS', alias: 'delia.pesos', holder: 'Delia Orrego', declaredAt: '2026-10-22T10:00:00.000Z' }]}
                actionFor={() => noop}
            />,
        );

        expect(texto(html)).toContain('Completá el CUIT o CUIL del titular: sin él, el comprador no podrá pagarte por transferencia.');
        expect(html).toMatch(/<details open="">/);
    });

    it('con el CUIT declarado no pide nada', () => {
        const html = renderToStaticMarkup(
            <BankAccountsView
                accounts={[{ currency: 'ARS', alias: 'delia.pesos', holder: 'Delia Orrego', holderTaxId: '20123456786', declaredAt: '2026-10-22T10:00:00.000Z' }]}
                actionFor={() => noop}
            />,
        );

        expect(texto(html)).not.toContain('Completá el CUIT');
        expect(html).not.toMatch(/<details open="">/);
    });
});

describe('declareBankAccountAction', () => {
    function form(destination: string, holder: string): FormData {
        const f = new FormData();
        f.set('destination', destination);
        f.set('holder', holder);
        f.set('holderTaxId', '20-12345678-6');
        return f;
    }

    it('solo dígitos es un CBU', async () => {
        declareBankAccount.mockResolvedValue({});

        const result = await declareBankAccountAction('ARS', {}, form('0110 5995 2000 0000 0000 04', ' Delia Orrego '));

        expect(declareBankAccount).toHaveBeenCalledWith({
            currency: 'ARS',
            cbu: '0110599520000000000004',
            holder: 'Delia Orrego',
            holderTaxId: '20-12345678-6',
        });
        expect(result.ok).toBe(true);
    });

    it('con letras es un alias', async () => {
        declareBankAccount.mockResolvedValue({});

        await declareBankAccountAction('USD', {}, form('delia.dolares', 'Delia Orrego'));

        expect(declareBankAccount).toHaveBeenCalledWith({
            currency: 'USD',
            alias: 'delia.dolares',
            holder: 'Delia Orrego',
            holderTaxId: '20-12345678-6',
        });
    });

    it('el motivo de la API vuelve tal cual', async () => {
        declareBankAccount.mockRejectedValue(new ApiError('VALIDATION', 'El CBU no es válido: revisá los números.', 400));

        const result = await declareBankAccountAction('ARS', {}, form('0110599520000000000005', 'Delia'));

        expect(result).toEqual({ error: 'El CBU no es válido: revisá los números.' });
    });
});
