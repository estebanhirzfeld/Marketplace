'use client';

import { useActionState, useState } from 'react';
import { Alert, Button, Field } from './ui';
import { PAISES_CPM_ALTO, PAISES_RESTO } from './paises';

type State = { error?: string; ok?: boolean };

const TIPOS = [
    { value: 'youtube', text: 'Canal de YouTube', metrica: 'Suscriptores' },
    { value: 'web', text: 'Sitio web', metrica: 'Autoridad de dominio' },
] as const;

/**
 * Lo que identifica al activo cambia según el tipo, y es el único campo que un
 * listing blind reserva: el comprador ve las métricas y necesita el NDA para
 * saber de qué activo se trata.
 */
const IDENTIDAD = {
    youtube: {
        label: 'Dirección del canal',
        placeholder: 'https://youtube.com/@tuCanal',
        hint: 'Solo la ve quien firme el NDA. Es lo que nos permite contrastar tus métricas con YouTube.',
    },
    web: {
        label: 'Dominio',
        placeholder: 'ejemplo.com',
        hint: 'Solo lo ve quien firme el NDA.',
    },
} as const;

export function PublishListingForm({
    action,
}: {
    action: (state: State, form: FormData) => Promise<State>;
}) {
    const [state, submit, pending] = useActionState(action, {});
    const [type, setTipo] = useState<string>('youtube');
    const [moneda, setMoneda] = useState<string>('USD');

    const actual = TIPOS.find((t) => t.value === type) ?? TIPOS[0];
    const identidad = IDENTIDAD[type as 'youtube' | 'web'] ?? IDENTIDAD.youtube;

    return (
        <form action={submit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
                <span className="text-[13px] text-[var(--color-tenue)]">Tipo de activo</span>
                <select
                    name="assetType"
                    value={type}
                    onChange={(e) => setTipo(e.target.value)}
                    className="h-11 rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] bg-[var(--color-fondo)] px-3.5 text-[14px] outline-none focus:border-[var(--color-acento)]"
                >
                    {TIPOS.map((t) => (
                        <option key={t.value} value={t.value}>{t.text}</option>
                    ))}
                </select>
            </label>

            <Field
                label={identidad.label}
                name="identidad"
                placeholder={identidad.placeholder}
                hint={identidad.hint}
                required
            />

            <Field label={actual.metrica} name="metrica" type="number" min={0} required />
            <Field label="Ingreso mensual (USD)" name="ingreso" type="number" min={0} step="0.01" required />

            {type === 'youtube' && (
                <>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[13px] text-[var(--color-tenue)]">
                            País principal de la audiencia
                        </span>
                        <select
                            name="pais"
                            defaultValue="AR"
                            className="h-11 rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] bg-[var(--color-fondo)] px-3.5 text-[14px] outline-none focus:border-[var(--color-acento)]"
                        >
                            <optgroup label="Publicidad mejor paga">
                                {PAISES_CPM_ALTO.map((p) => (
                                    <option key={p.codigo} value={p.codigo}>{p.nombre}</option>
                                ))}
                            </optgroup>
                            <optgroup label="Resto">
                                {PAISES_RESTO.map((p) => (
                                    <option key={p.codigo} value={p.codigo}>{p.nombre}</option>
                                ))}
                            </optgroup>
                        </select>
                        <span className="text-[12px] text-[var(--color-apagado)]">
                            De dónde viene la mayor parte de tus vistas. Influye en la estimación:
                            la publicidad se paga distinto según el país.
                        </span>
                    </label>
                    <label className="flex items-center gap-2.5 text-[14px]">
                        <input type="checkbox" name="monetizado" defaultChecked className="accent-[var(--color-acento)]" />
                        El canal está monetizado
                    </label>
                </>
            )}

            <div className="flex flex-col gap-1.5">
                <span className="text-[13px] text-[var(--color-tenue)]">Precio pedido</span>
                <div className="flex gap-2.5">
                    <input
                        name="precio"
                        type="number"
                        min={1}
                        step="0.01"
                        required
                        className="h-11 flex-1 rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] bg-[var(--color-fondo)] px-3.5 text-[14px] outline-none transition-colors focus:border-[var(--color-acento)]"
                    />
                    <select
                        name="moneda"
                        value={moneda}
                        onChange={(e) => setMoneda(e.target.value)}
                        className="h-11 w-24 rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] bg-[var(--color-fondo)] px-3 text-[14px] outline-none focus:border-[var(--color-acento)]"
                    >
                        <option value="USD">USD</option>
                        <option value="ARS">ARS</option>
                    </select>
                </div>
                <span className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                    {moneda === 'USD'
                        ? 'Si el comprador paga en pesos, la conversión se hace al tipo de cambio del día en que se paga.'
                        : 'El precio queda fijado en pesos. Si el comprador paga en otra moneda, la conversión se hace al tipo de cambio del día en que se paga.'}
                </span>
            </div>

            <p className="rounded-[var(--radius-chico)] border border-[var(--color-borde)] p-3.5 text-[12px] leading-relaxed text-[var(--color-apagado)]">
                Todos los activos se publican de forma confidencial. La dirección del activo se le
                muestra únicamente a quien firme el acuerdo de confidencialidad; las métricas se
                ven desde el principio, para que se pueda evaluar sin saber de qué activo se trata.
            </p>

            {state.error && <Alert>{state.error}</Alert>}
            {state.ok && (
                <div className="rounded-[var(--radius-chico)] border border-[var(--color-acento)]/40 px-4 py-3 text-[13px] text-[var(--color-acento)]">
                    Activo creado como borrador. Enviálo a revisión cuando esté ready.
                </div>
            )}

            <Button type="submit" disabled={pending} className="mt-1 w-full">
                {pending ? 'Publicando…' : 'Crear activo'}
            </Button>

            <p className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                Nace como borrador y no lo ve nadie. Para publicarlo hay que enviarlo a revisión,
                y eso requiere tener la identidad verificada.
            </p>
        </form>
    );
}
