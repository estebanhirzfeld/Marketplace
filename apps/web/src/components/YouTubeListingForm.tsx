'use client';

import { useActionState, useEffect, useState } from 'react';
import { ASSET_NICHES, AssetNiche } from '@marketplace/shared-types';
import { nicheLabel } from '@/lib/format';
import { scheduleEstimate } from '@/lib/latestEstimate';
import { Button } from './ui';
import { ActionFailure } from './OperationAction';
import { PriceSection } from './PriceSection';

const CONTROL =
    'h-11 rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] bg-[var(--color-fondo)] px-3.5 text-[14px] outline-none focus:border-[var(--color-acento)]';

type State = { error?: string; next?: { href: string; label: string } };
type Estimate = { cents: number; currency: string } | null;

/**
 * Lo que Google no sabe de un canal conectado: de qué trata, si se muestra la
 * cara y a cuánto lo quiere vender. Lo demás ya está en la tarjeta del canal y
 * no se vuelve a pedir.
 *
 * La valuación se pide a la API con los datos verificados más lo que se va
 * completando. Va por el servidor a propósito: la fórmula vive en la strategy
 * del dominio y recalcularla acá sería tener dos versiones de la misma regla.
 */
export function YouTubeListingForm({
    action,
    estimate,
    verifiedData,
}: {
    action: (state: State, form: FormData) => Promise<State>;
    estimate: (assetType: string, assetData: Record<string, unknown>) => Promise<Estimate>;
    /** Los datos leídos de Google, con la forma que espera la valuación. */
    verifiedData: Record<string, unknown>;
}) {
    const [state, submit, pending] = useActionState(action, {});
    const [currency, setCurrency] = useState('USD');
    const [price, setPrice] = useState('');
    const [niche, setNiche] = useState<string>(AssetNiche.OTHER);
    const [noFace, setNoFace] = useState(false);
    const [estimated, setEstimated] = useState<Estimate>(null);

    useEffect(() => {
        // La pausa evita un pedido por cada cambio; el rubro y el rostro son
        // lo único que mueve la valuación mientras se completa el formulario.
        // Al cambiar algo, el pedido anterior se cancela y su respuesta se descarta.
        return scheduleEstimate(
            () => estimate('youtube', { ...verifiedData, niche, hasNoFaceContent: noFace }),
            setEstimated,
            300,
        );
    }, [estimate, verifiedData, niche, noFace]);

    return (
        <YouTubeListingFormView
            state={state}
            pending={pending}
            submit={submit}
            estimated={estimated}
            currency={currency}
            onCurrencyChange={setCurrency}
            price={price}
            onPriceChange={setPrice}
            niche={niche}
            onNicheChange={setNiche}
            noFace={noFace}
            onNoFaceChange={setNoFace}
        />
    );
}

/** Separada del estado para que `/sistema` y los tests la muestren en cada caso. */
export function YouTubeListingFormView({
    state,
    pending,
    submit,
    estimated,
    currency,
    onCurrencyChange,
    price,
    onPriceChange,
    niche,
    onNicheChange,
    noFace,
    onNoFaceChange,
}: {
    state: State;
    pending: boolean;
    submit: (form: FormData) => void;
    estimated: Estimate;
    currency: string;
    onCurrencyChange: (value: string) => void;
    price: string;
    onPriceChange: (value: string) => void;
    niche: string;
    onNicheChange: (value: string) => void;
    noFace: boolean;
    onNoFaceChange: (value: boolean) => void;
}) {
    return (
        <form action={submit} className="flex flex-col gap-4">
            <h2 className="text-[17px] font-bold">Completá lo que falta</h2>

            {/* El rubro es lo único que dice de qué trata un activo blindado
                sin revelar cuál es: la grilla lo usa de título. */}
            <label className="flex flex-col gap-2">
                <span className="text-[13px] text-[var(--color-tenue)]">Rubro</span>
                <select
                    name="niche"
                    value={niche}
                    onChange={(e) => onNicheChange(e.target.value)}
                    className={CONTROL}
                >
                    {ASSET_NICHES.map((n) => (
                        <option key={n} value={n}>{nicheLabel(n)}</option>
                    ))}
                </select>
                <span className="text-[12px] text-[var(--color-apagado)]">
                    Es lo que van a ver los compradores como título. No revela cuál es tu canal.
                </span>
            </label>

            <label className="flex items-center gap-2.5 text-[14px]">
                <input
                    type="checkbox"
                    name="sinRostro"
                    checked={noFace}
                    onChange={(e) => onNoFaceChange(e.target.checked)}
                    className="accent-[var(--color-acento)]"
                />
                Mi contenido es sin rostro
            </label>

            <PriceSection
                currency={currency}
                onCurrencyChange={onCurrencyChange}
                price={price}
                onPriceChange={onPriceChange}
                estimated={estimated}
            />

            {state.error && <ActionFailure error={state.error} next={state.next} />}

            <Button type="submit" disabled={pending} className="mt-1 w-full">
                {pending ? 'Creando…' : 'Crear borrador'}
            </Button>

            <p className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                Nace como borrador y no lo ve nadie. Para publicarlo hay que enviarlo a revisión, y
                eso requiere tener la identidad verificada.
            </p>
        </form>
    );
}
