'use client';

import { useActionState, useState } from 'react';
import { Alert, Button } from './ui';

type State = { error?: string };

/**
 * Un admin deja constancia de que la plataforma obtuvo acceso al activo.
 *
 * Es manual y no hay alternativa: `channels.list` no expone ningún campo que
 * indique si un canal es Cuenta de Marca ni que liste sus propietarios, y
 * quien es invitado a administrar un canal tampoco puede usar las APIs de
 * YouTube. Ningún software puede comprobar este estado.
 *
 * La fecha que se pide no es la de hoy sino la del día en que la plataforma
 * quedó con acceso: de ella depende cuándo se cumple el plazo de espera, así
 * que ponerla mal corre el plazo entero.
 */
export function PlatformAccessForm({
    registerUser,
    revocar,
    transferableFrom,
    transferable,
    handoverSteps = [],
    custodyAccounts = [],
}: {
    registerUser: (state: State, form: FormData) => Promise<State>;
    revocar: (state: State) => Promise<State>;
    /** Solo viene cuando ya hay constancia de acceso registrada. */
    transferableFrom?: string;
    transferable: boolean;
    /**
     * Lo que el vendedor tenía que hacer para cedernos el activo. Se muestra
     * como contexto de lo que se está dando por cumplido: la constancia la
     * firma una persona, así que conviene que tenga a la vista qué atestigua.
     */
    handoverSteps?: { id: string; description: string; instruction?: string }[];
    /**
     * Las cuentas de custodia activas y compatibles con este activo. La
     * constancia tiene que decir a cuál se cedió: sin eso el vendedor no sabe
     * a quién invitar.
     */
    custodyAccounts?: { id: string; label: string; identifier: string }[];
}) {
    const [estadoRegistrar, enviarRegistrar, registrando] = useActionState(registerUser, {});
    const [estadoRevocar, enviarRevocar, revocando] = useActionState(revocar, {});
    const [confirmingRevocation, setConfirmandoRevocacion] = useState(false);

    const hoy = new Date().toISOString().slice(0, 10);

    if (transferableFrom) {
        return (
            <div className="flex flex-col gap-4">
                {estadoRevocar.error && <Alert>{estadoRevocar.error}</Alert>}

                <div className="flex flex-col gap-1.5 text-[13px]">
                    <Row
                        label="Transferible"
                        value={
                            transferable
                                ? 'ya se cumplió el plazo'
                                : `desde el ${date(transferableFrom)}`
                        }
                    />
                </div>

                {confirmingRevocation ? (
                    <div className="flex flex-col gap-3 border-t border-[var(--color-borde)] pt-4">
                        <p className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                            Borrar la constancia devuelve el activo a no transferible y reinicia el
                            conteo: si más adelante se recupera el acceso, los días vuelven a
                            contarse desde cero.
                        </p>
                        <div className="flex gap-2.5">
                            <form action={enviarRevocar}>
                                <Button
                                    type="submit"
                                    variant="peligro"
                                    disabled={revocando}
                                    className="px-4 py-2 text-[13px]"
                                >
                                    {revocando ? 'Borrando…' : 'Confirmar'}
                                </Button>
                            </form>
                            <Button
                                type="button"
                                variant="fantasma"
                                onClick={() => setConfirmandoRevocacion(false)}
                                className="px-4 py-2 text-[13px]"
                            >
                                Volver
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Button
                        type="button"
                        variant="peligro"
                        onClick={() => setConfirmandoRevocacion(true)}
                        className="px-4 py-2 text-[13px]"
                    >
                        La plataforma perdió el acceso
                    </Button>
                )}
            </div>
        );
    }

    return (
        <form action={enviarRegistrar} className="flex flex-col gap-4">
            {estadoRegistrar.error && <Alert>{estadoRegistrar.error}</Alert>}

            {handoverSteps.length > 0 && (
                <div className="flex flex-col gap-3 rounded-[var(--radius-chico)] border border-[var(--color-borde)] p-4">
                    <span className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                        Antes de registrar, comprobá que el vendedor hizo lo suyo:
                    </span>
                    <ol className="flex flex-col gap-2">
                        {handoverSteps.map((paso, i) => (
                            <li key={paso.id} className="flex gap-3 text-[13px]">
                                <span className="font-mono text-[12px] text-[var(--color-acento)]">
                                    {i + 1}
                                </span>
                                <span className="leading-relaxed text-[var(--color-tenue)]">
                                    {paso.description}
                                </span>
                            </li>
                        ))}
                    </ol>
                </div>
            )}

            <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Cuenta de custodia</span>
                {custodyAccounts.length === 0 ? (
                    <p className="rounded-lg border border-[var(--color-alerta)]/40 p-2.5 text-[12px] leading-relaxed text-[var(--color-alerta)]">
                        No hay ninguna cuenta de custodia activa y compatible con este activo. Creá
                        una en <span className="font-mono">Cuentas</span> antes de registrar el
                        acceso: sin ella el vendedor no sabría a quién invitar.
                    </p>
                ) : (
                    <select
                        name="custodyAccountId"
                        required
                        defaultValue=""
                        className="rounded-lg border border-[var(--color-borde)] bg-transparent p-2.5 text-[13px] outline-none focus:border-[var(--color-acento)]"
                    >
                        <option value="" disabled>
                            Elegí la cuenta que sostiene este activo
                        </option>
                        {custodyAccounts.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.label} — {c.identifier}
                            </option>
                        ))}
                    </select>
                )}
                <span className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                    La identidad que el vendedor invitó como propietaria. Queda congelada en la
                    constancia.
                </span>
            </label>

            <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Con acceso desde</span>
                <input
                    type="date"
                    name="accessSince"
                    required
                    max={hoy}
                    defaultValue={hoy}
                    className="rounded-lg border border-[var(--color-borde)] bg-transparent p-2.5 font-mono text-[13px] outline-none focus:border-[var(--color-acento)]"
                />
                <span className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                    El día en que la plataforma quedó con acceso, no el de hoy. El plazo de espera se
                    cuenta desde esta fecha.
                </span>
            </label>

            <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Observaciones</span>
                <textarea
                    name="notes"
                    rows={2}
                    placeholder="Invitada como propietaria de la Cuenta de Marca."
                    className="rounded-lg border border-[var(--color-borde)] bg-transparent p-2.5 text-[13px] leading-relaxed outline-none placeholder:text-[var(--color-apagado)] focus:border-[var(--color-acento)]"
                />
            </label>

            <Button type="submit" disabled={registrando || custodyAccounts.length === 0}>
                {registrando ? 'Registrando…' : 'Registrar el acceso'}
            </Button>
        </form>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between">
            <span className="text-[var(--color-tenue)]">{label}</span>
            <span className="font-mono">{value}</span>
        </div>
    );
}

function date(iso: string): string {
    return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}
