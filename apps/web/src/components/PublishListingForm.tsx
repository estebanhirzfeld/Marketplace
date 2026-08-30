'use client';

import { useActionState, useState } from 'react';
import { Alert, Button, Field } from './ui';

type State = { error?: string; ok?: boolean };

const TIPOS = [
    { value: 'youtube', text: 'Canal de YouTube', metrica: 'Suscriptores' },
    { value: 'web', text: 'Sitio web', metrica: 'Autoridad de dominio' },
    { value: 'instagram', text: 'Instagram', metrica: 'Seguidores' },
    { value: 'tiktok', text: 'TikTok', metrica: 'Seguidores' },
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
    social: {
        label: 'Dirección del perfil',
        placeholder: 'https://instagram.com/tuPerfil',
        hint: 'Solo la ve quien firme el NDA.',
    },
} as const;

export function PublishListingForm({
    action,
}: {
    action: (state: State, form: FormData) => Promise<State>;
}) {
    const [state, submit, pending] = useActionState(action, {});
    const [type, setTipo] = useState<string>('youtube');

    const actual = TIPOS.find((t) => t.value === type) ?? TIPOS[0];
    const esSocial = type === 'instagram' || type === 'tiktok';
    const identidad = IDENTIDAD[esSocial ? 'social' : (type as 'youtube' | 'web')] ?? IDENTIDAD.youtube;

    return (
        <form action={submit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
                <span className="text-[13px] text-[var(--color-tenue)]">Tipo de asset</span>
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

            {esSocial && (
                <Field label="Engagement (%)" name="engagement" type="number" min={0} step="0.1" />
            )}

            {type === 'youtube' && (
                <>
                    <Field label="País principal de la audiencia" name="pais" defaultValue="AR" maxLength={2} hint="Código de dos letras: AR, US, ES…" />
                    <label className="flex items-center gap-2.5 text-[14px]">
                        <input type="checkbox" name="monetizado" defaultChecked className="accent-[var(--color-acento)]" />
                        El canal está monetizado
                    </label>
                </>
            )}

            <Field label="Precio pedido (USD)" name="precio" type="number" min={1} required />

            <label className="flex items-start gap-2.5 text-[14px]">
                <input type="checkbox" name="blind" defaultChecked className="mt-1 accent-[var(--color-acento)]" />
                <span>
                    Publicación confidencial
                    <span className="mt-0.5 block text-[13px] text-[var(--color-tenue)]">
                        La URL y las métricas crudas se muestran solo a quien firme el NDA.
                    </span>
                </span>
            </label>

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
