'use client';

import { useActionState } from 'react';
import { Alert, Button } from './ui';

type State = { error?: string; ok?: boolean; message?: string };

/** Un CBU o un alias y el titular, para una moneda. */
export function BankAccountForm({
    action,
    current,
}: {
    action: (state: State, form: FormData) => Promise<State>;
    current?: { destination: string; holder: string };
}) {
    const [state, submit, pending] = useActionState(action, {});

    return (
        <form action={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">CBU o alias</span>
                <input
                    name="destination"
                    required
                    defaultValue={current?.destination}
                    autoComplete="off"
                    placeholder="22 números, o tu alias"
                    className="rounded-lg border border-[var(--color-borde)] bg-transparent p-2.5 font-mono text-[14px] outline-none placeholder:text-[var(--color-apagado)] focus:border-[var(--color-acento)]"
                />
            </label>
            <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Titular</span>
                <input
                    name="holder"
                    required
                    defaultValue={current?.holder}
                    autoComplete="name"
                    placeholder="Como figura en el banco"
                    className="rounded-lg border border-[var(--color-borde)] bg-transparent p-2.5 text-[14px] outline-none placeholder:text-[var(--color-apagado)] focus:border-[var(--color-acento)]"
                />
            </label>
            {state.error && <Alert>{state.error}</Alert>}
            {state.ok && state.message && <Alert tono="listo">{state.message}</Alert>}
            <Button type="submit" variant="secundario" disabled={pending}>
                {pending ? 'Guardando…' : 'Guardar la cuenta'}
            </Button>
        </form>
    );
}
