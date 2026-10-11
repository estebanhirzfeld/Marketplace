'use client';

import { useActionState, useEffect, useState } from 'react';
import { ASSET_NICHES, AssetNiche } from '@marketplace/shared-types';
import { nicheLabel } from '@/lib/format';
import { scheduleEstimate } from '@/lib/latestEstimate';
import { Alert, Button, Field } from './ui';
import { PriceSection } from './PriceSection';
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
        nombre: 'Nombre del canal',
        nombrePlaceholder: 'Nivel Completo',
    },
    web: {
        label: 'Dominio',
        placeholder: 'ejemplo.com',
        hint: 'Solo lo ve quien firme el NDA.',
        nombre: 'Nombre del sitio',
        nombrePlaceholder: 'Probamos Todo',
    },
} as const;

export function PublishListingForm({
    action,
    estimate,
    types = ['youtube', 'web'],
}: {
    /** Con un solo tipo, el selector no se muestra: no hay nada que elegir. */
    types?: readonly ('youtube' | 'web')[];
    action: (state: State, form: FormData) => Promise<State>;
    estimate: (
        assetType: string,
        assetData: Record<string, unknown>,
    ) => Promise<{ cents: number; currency: string } | null>;
}) {
    const [state, submit, pending] = useActionState(action, {});
    const [type, setTipo] = useState<string>(types[0] ?? 'youtube');
    const [moneda, setMoneda] = useState<string>('USD');
    const [precio, setPrecio] = useState('');
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

        // Al cambiar algo, el pedido anterior se cancela y su respuesta se descarta.
        return scheduleEstimate(() => estimate(type, assetData), setEstimado, 400);
    }, [type, niche, metrica, ingreso, monetizado, estimate]);

    return (
        <form action={submit} className="flex flex-col gap-4">
            {types.length === 1 && <input type="hidden" name="assetType" value={type} />}
            {types.length > 1 && (
            <label className="flex flex-col gap-2">
                <span className="text-[13px] text-[var(--color-tenue)]">Tipo de activo</span>
                <select
                    name="assetType"
                    value={type}
                    onChange={(e) => setTipo(e.target.value)}
                    className="h-11 rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] bg-[var(--color-fondo)] px-3.5 text-[14px] outline-none focus:border-[var(--color-acento)]"
                >
                    {TIPOS.filter((t) => types.includes(t.value)).map((t) => (
                        <option key={t.value} value={t.value}>{t.text}</option>
                    ))}
                </select>
            </label>
            )}

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
                label={identidad.nombre}
                name="nombre"
                placeholder={identidad.nombrePlaceholder}
                hint="Con qué lo vas a reconocer vos y con qué lo va a nombrar la plataforma. Es reservado: solo lo ve quien firme el acuerdo."
                required
            />

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
                vendedor fijaba el precio a ciegas. Ahora va como referencia
                al costado del precio, que es lo que pide. */}
            <PriceSection
                currency={moneda}
                onCurrencyChange={setMoneda}
                price={precio}
                onPriceChange={setPrecio}
                estimated={estimado}
                basis="los datos que cargaste"
            />

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
