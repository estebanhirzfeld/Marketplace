import { UserRole } from '@marketplace/shared-types';
import type { SellerBankAccountDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { declareBankAccountAction } from '@/app/perfil/actions';
import { BankAccountForm } from './BankAccountForm';
import { Panel } from './ui';

type Action = (state: { error?: string; ok?: boolean; message?: string }, form: FormData) => Promise<{ error?: string; ok?: boolean; message?: string }>;

const CURRENCIES: { currency: 'ARS' | 'USD'; label: string }[] = [
    { currency: 'ARS', label: 'En pesos' },
    { currency: 'USD', label: 'En dólares' },
];

/**
 * Dónde cobra el vendedor cuando el comprador paga por transferencia: el
 * comprador le transfiere lo suyo directo a esta cuenta. Una por moneda.
 */
export function BankAccountsView({
    accounts,
    actionFor,
}: {
    accounts: SellerBankAccountDto[];
    actionFor: (currency: 'ARS' | 'USD') => Action;
}) {
    return (
        <Panel title="DÓNDE COBRÁS POR TRANSFERENCIA">
            <div className="flex flex-col gap-6">
                <p className="text-[13px] leading-relaxed text-[var(--color-tenue)]">
                    Si el comprador paga por transferencia, te manda lo tuyo directo a esta cuenta, en la moneda de la venta.
                </p>
                {CURRENCIES.map(({ currency, label }) => {
                    const account = accounts.find((a) => a.currency === currency);
                    const destination = account?.cbu ?? account?.alias ?? '';
                    return (
                        <div key={currency} className="flex flex-col gap-3">
                            <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-tenue)]">{label.toUpperCase()}</span>
                            {account ? (
                                <div className="flex flex-col gap-2 text-[14px]">
                                    <span className="font-mono">{destination}</span>
                                    <span className="text-[13px] text-[var(--color-tenue)]">{account.holder}</span>
                                    <details>
                                        <summary className="cursor-pointer text-[13px] text-[var(--color-tenue)]">Cambiar la cuenta</summary>
                                        <div className="mt-3">
                                            <BankAccountForm action={actionFor(currency)} current={{ destination, holder: account.holder, holderTaxId: account.holderTaxId }} />
                                        </div>
                                    </details>
                                </div>
                            ) : (
                                <BankAccountForm action={actionFor(currency)} />
                            )}
                        </div>
                    );
                })}
            </div>
        </Panel>
    );
}

/** Para el perfil. La plataforma no cobra ventas, así que a un admin no se le muestra. */
export async function BankAccountSection({ role }: { role: string }) {
    if (role === UserRole.ADMIN) return null;

    let accounts: SellerBankAccountDto[];
    try {
        accounts = await api().bankAccounts();
    } catch {
        // El perfil tiene que cargar igual: sin la lista, se ofrece declarar.
        accounts = [];
    }

    return <BankAccountsView accounts={accounts} actionFor={(currency) => declareBankAccountAction.bind(null, currency)} />;
}
