'use client';

import { useActionState, useState } from 'react';
import { Aviso, Boton, Campo } from './ui';

type Estado = { error?: string; ok?: boolean };

const TIPOS = [
    { valor: 'youtube', texto: 'Canal de YouTube', metrica: 'Suscriptores' },
    { valor: 'web', texto: 'Sitio web', metrica: 'Autoridad de dominio' },
    { valor: 'instagram', texto: 'Instagram', metrica: 'Seguidores' },
    { valor: 'tiktok', texto: 'TikTok', metrica: 'Seguidores' },
] as const;

export function FormularioPublicar({
    accion,
}: {
    accion: (estado: Estado, datos: FormData) => Promise<Estado>;
}) {
    const [estado, enviar, pendiente] = useActionState(accion, {});
    const [tipo, setTipo] = useState<string>('youtube');

    const actual = TIPOS.find((t) => t.valor === tipo) ?? TIPOS[0];
    const esSocial = tipo === 'instagram' || tipo === 'tiktok';

    return (
        <form action={enviar} className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
                <span className="text-[13px] text-[var(--color-tenue)]">Tipo de activo</span>
                <select
                    name="assetType"
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value)}
                    className="h-11 rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] bg-[var(--color-fondo)] px-3.5 text-[14px] outline-none focus:border-[var(--color-acento)]"
                >
                    {TIPOS.map((t) => (
                        <option key={t.valor} value={t.valor}>{t.texto}</option>
                    ))}
                </select>
            </label>

            <Campo etiqueta={actual.metrica} name="metrica" type="number" min={0} required />
            <Campo etiqueta="Ingreso mensual (USD)" name="ingreso" type="number" min={0} step="0.01" required />

            {esSocial && (
                <Campo etiqueta="Engagement (%)" name="engagement" type="number" min={0} step="0.1" />
            )}

            {tipo === 'youtube' && (
                <>
                    <Campo etiqueta="País principal de la audiencia" name="pais" defaultValue="AR" maxLength={2} ayuda="Código de dos letras: AR, US, ES…" />
                    <label className="flex items-center gap-2.5 text-[14px]">
                        <input type="checkbox" name="monetizado" defaultChecked className="accent-[var(--color-acento)]" />
                        El canal está monetizado
                    </label>
                </>
            )}

            <Campo etiqueta="Precio pedido (USD)" name="precio" type="number" min={1} required />

            <label className="flex items-start gap-2.5 text-[14px]">
                <input type="checkbox" name="blind" defaultChecked className="mt-1 accent-[var(--color-acento)]" />
                <span>
                    Publicación confidencial
                    <span className="mt-0.5 block text-[13px] text-[var(--color-tenue)]">
                        La URL y las métricas crudas se muestran solo a quien firme el NDA.
                    </span>
                </span>
            </label>

            {estado.error && <Aviso>{estado.error}</Aviso>}
            {estado.ok && (
                <div className="rounded-[var(--radius-chico)] border border-[var(--color-acento)]/40 px-4 py-3 text-[13px] text-[var(--color-acento)]">
                    Activo creado como borrador. Enviálo a revisión cuando esté listo.
                </div>
            )}

            <Boton type="submit" disabled={pendiente} className="mt-1 w-full">
                {pendiente ? 'Publicando…' : 'Crear activo'}
            </Boton>

            <p className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                Nace como borrador y no lo ve nadie. Para publicarlo hay que enviarlo a revisión,
                y eso requiere tener la identidad verificada.
            </p>
        </form>
    );
}
