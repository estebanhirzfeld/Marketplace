'use client';

import { useActionState, useState } from 'react';
import type { CustodyAccountDto } from '@marketplace/api-contract';
import { CustodyAccountForm } from './CustodyAccountForm';
import { Alert, Button, Panel } from './ui';
import {
    createCustodyAccount,
    updateCustodyAccount,
    setCustodyAccountActive,
} from '@/app/admin/cuentas/actions';

const TIPO: Record<string, string> = { youtube: 'Canal de YouTube', web: 'Sitio web' };

export function CustodyAccountsManager({ cuentas }: { cuentas: CustodyAccountDto[] }) {
    const [creando, setCreando] = useState(cuentas.length === 0);

    return (
        <div className="flex flex-col gap-6">
            <Panel title="DAR DE ALTA UNA CUENTA">
                {creando ? (
                    <CustodyAccountForm action={createCustodyAccount} onDone={() => setCreando(false)} />
                ) : (
                    <Button type="button" variant="secundario" onClick={() => setCreando(true)}>
                        Nueva cuenta de custodia
                    </Button>
                )}
            </Panel>

            {cuentas.length === 0 ? (
                <p className="text-[13px] leading-relaxed text-[var(--color-apagado)]">
                    Todavía no hay ninguna cuenta de custodia. Registrar el acceso de la plataforma a
                    un activo la exige, así que sin al menos una el flujo queda trabado.
                </p>
            ) : (
                <ul className="flex flex-col gap-3">
                    {cuentas.map((cuenta) => (
                        <li key={cuenta.id}>
                            <Fila cuenta={cuenta} />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function Fila({ cuenta }: { cuenta: CustodyAccountDto }) {
    const [editando, setEditando] = useState(false);
    const [estadoActivo, toggleActivo, cambiandoActivo] = useActionState(
        setCustodyAccountActive.bind(null, cuenta.id, !cuenta.isActive),
        {},
    );

    return (
        <div className="flex flex-col gap-3 rounded-[var(--radius-medio)] border border-[var(--color-borde)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <span className="text-[14px] font-medium">{cuenta.label}</span>
                    <span className="font-mono text-[12px] text-[var(--color-tenue)]">
                        {cuenta.identifier}
                    </span>
                    <span className="text-[12px] text-[var(--color-apagado)]">
                        {TIPO[cuenta.assetType] ?? cuenta.assetType} · sostiene {cuenta.heldAssets}{' '}
                        activo{cuenta.heldAssets === 1 ? '' : 's'}
                    </span>
                </div>
                <span
                    className={`rounded-[var(--radius-chico)] border px-2 py-1 font-mono text-[10px] ${
                        cuenta.isActive
                            ? 'border-[var(--color-acento)]/40 text-[var(--color-acento)]'
                            : 'border-[var(--color-borde)] text-[var(--color-apagado)]'
                    }`}
                >
                    {cuenta.isActive ? 'ACTIVA' : 'INACTIVA'}
                </span>
            </div>

            {estadoActivo.error && <Alert>{estadoActivo.error}</Alert>}

            <div className="flex flex-wrap gap-2.5">
                <Button
                    type="button"
                    variant="fantasma"
                    onClick={() => setEditando((v) => !v)}
                    className="px-3 py-1.5 text-[12px]"
                >
                    {editando ? 'Cerrar' : 'Editar'}
                </Button>
                <form action={toggleActivo}>
                    <Button
                        type="submit"
                        variant={cuenta.isActive ? 'peligro' : 'secundario'}
                        disabled={cambiandoActivo}
                        className="px-3 py-1.5 text-[12px]"
                    >
                        {cambiandoActivo
                            ? 'Guardando…'
                            : cuenta.isActive
                              ? 'Dar de baja'
                              : 'Reactivar'}
                    </Button>
                </form>
            </div>

            {editando && (
                <div className="border-t border-[var(--color-borde)] pt-4">
                    <CustodyAccountForm
                        action={updateCustodyAccount.bind(null, cuenta.id)}
                        cuenta={cuenta}
                        onDone={() => setEditando(false)}
                    />
                </div>
            )}
        </div>
    );
}
