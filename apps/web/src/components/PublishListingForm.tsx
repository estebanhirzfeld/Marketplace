'use client';

import { useActionState, useEffect, useState } from 'react';
import { ASSET_NICHES, AssetNiche } from '@marketplace/shared-types';
import { money, nicheLabel } from '@/lib/format';
import { Alert, Button, Field } from './ui';
import { PAISES_CPM_ALTO, PAISES_RESTO } from './paises';

const CONTROL =
    'h-11 rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] bg-[var(--color-fondo)] px-3.5 text-[14px] outline-none focus:border-[var(--color-acento)]';

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
    estimate,
}: {
    action: (state: State, form: FormData) => Promise<State>;
    estimate: (
        assetType: string,
        assetData: Record<string, unknown>,
    ) => Promise<{ cents: number; currency: string } | null>;
}) {
    const [state, submit, pending] = useActionState(action, {});
    const [type, setTipo] = useState<string>('youtube');
    const [moneda, setMoneda] = useState<string>('USD');
    const [niche, setRubro] = useState<string>(AssetNiche.OTHER);
    const [metrica, setMetrica] = useState<number>(0);
    const [ingreso, setIngreso] = useState<number>(0);
    const [monetizado, setMonetizado] = useState(true);
    const [estimado, setEstimado] = useState<{ cents: number; currency: string } | null>(null);

    const actual = TIPOS.find((t) => t.value === type) ?? TIPOS[0];
    const identidad = IDENTIDAD[type as 'youtube' | 'web'] ?? IDENTIDAD.youtube;

    /**
     * La valuación se pide al servidor mientras se escribe, con una pausa para
     * no disparar un pedido por tecla. La fórmula vive en la strategy del
     * dominio: recalcularla acá sería tener dos versiones de la misma regla.
     */
    useEffect(() => {
        const assetData: Record<string, unknown> = {
            monthlyRevenueUsdCents: Math.round((ingreso || 0) * 100),
            currency: 'USD',
            niche,
        };
        if (type === 'youtube') {
            assetData.subscribers = Math.round(metrica || 0);
            assetData.isMonetized = monetizado;
        } else {
            assetData.domainAuthority = Math.round(metrica || 0);
        }

        const t = setTimeout(() => {
            estimate(type, assetData).then(setEstimado);
        }, 400);
        return () => clearTimeout(t);
    }, [type, niche, metrica, ingreso, monetizado, estimate]);

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

            {/* El rubro es lo único que dice de qué trata un activo blindado
                sin revelar cuál es, así que es lo que la grilla usa de título.
                Sin él las tarjetas repetían el tipo de activo dos veces. */}
            <label className="flex flex-col gap-2">
                <span className="text-[13px] text-[var(--color-tenue)]">Rubro</span>
                <select
                    name="niche"
                    value={niche}
                    onChange={(e) => setRubro(e.target.value)}
                    className={CONTROL}
                >
                    {ASSET_NICHES.map((n) => (
                        <option key={n} value={n}>{nicheLabel(n)}</option>
                    ))}
                </select>
                <span className="text-[12px] text-[var(--color-apagado)]">
                    Es lo que van a ver los compradores como título de tu publicación. No revela
                    cuál es tu activo.
                </span>
            </label>

            <Field
                label={identidad.label}
                name="identidad"
                placeholder={identidad.placeholder}
                hint={identidad.hint}
                required
            />

            <Field
                label={actual.metrica}
                name="metrica"
                type="number"
                min={0}
                required
                value={metrica || ''}
                onChange={(e) => setMetrica(Number(e.target.value))}
            />
            <Field
                label="Ingreso mensual (USD)"
                name="ingreso"
                type="number"
                min={0}
                step="0.01"
                required
                value={ingreso || ''}
                onChange={(e) => setIngreso(Number(e.target.value))}
            />

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
                        <input
                            type="checkbox"
                            name="monetizado"
                            checked={monetizado}
                            onChange={(e) => setMonetizado(e.target.checked)}
                            className="accent-[var(--color-acento)]"
                        />
                        El canal está monetizado
                    </label>
                </>
            )}

            {/* La valuación estaba calculada desde siempre en la strategy del
                activo, pero solo se mostraba en la ficha ya publicada: el
                vendedor fijaba el precio a ciegas y recién después veía contra
                qué se lo comparaba. */}
            <div className="flex flex-col gap-1.5 rounded-[var(--radius-chico)] border border-[var(--color-borde)] p-4">
                <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] text-[var(--color-tenue)]">
                        Nuestra valuación estimada
                    </span>
                    <span className="font-mono text-[18px] font-bold text-[var(--color-acento)]">
                        {estimado ? money(estimado) : '—'}
                    </span>
                </div>
                <span className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                    {estimado
                        ? 'Sale de tus métricas con la fórmula del tipo de activo. Es una referencia: el precio lo ponés vos.'
                        : 'Completá las métricas y el ingreso mensual para verla.'}
                </span>
            </div>

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
                    Activo creado como borrador. Enviálo a revisión cuando esté listo.
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
