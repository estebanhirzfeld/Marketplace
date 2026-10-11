import type { AssetFieldKindDto } from '@marketplace/api-contract';
import { fieldValue } from '@/lib/format';
import { visibleFields } from '@/lib/publishedFields';
import { isWebAddress, shortenChannelUrl } from '@/lib/youtubeChannel';

interface Field {
    key: string;
    label: string;
    kind: AssetFieldKindDto;
    internal?: boolean;
}

/**
 * Los datos que ve el comprador, a todo el ancho y en dos columnas.
 *
 * El orden y las etiquetas los declara el tipo de activo: la pantalla no sabe
 * qué campos existen, solo los dibuja en el orden en que se los dan. Un valor
 * que es una dirección web se muestra como enlace (abreviado a la vista) para
 * que el vendedor pueda abrir su propio canal y comprobar que es el correcto.
 */
export function PublishedData({
    fields,
    data,
    exclude,
}: {
    fields: readonly Field[];
    data: Record<string, unknown>;
    /** Claves que otra tarjeta de la pantalla ya muestra. */
    exclude?: readonly string[];
}) {
    const visibles = visibleFields(fields, data, exclude);

    return (
        <section className="overflow-hidden rounded-[var(--radius-grande)] border border-[var(--color-borde)] bg-[var(--color-superficie)]">
            <h2 className="border-b border-[var(--color-borde)] px-6 py-4 font-mono text-[12px] font-medium tracking-[0.12em] text-[var(--color-tenue)]">
                LOS DATOS PUBLICADOS
            </h2>
            <div className="grid gap-x-10 px-6 pb-3 pt-1 md:grid-cols-2">
                {visibles.map((f) => {
                    const value = data[f.key];
                    return (
                        <div
                            key={f.key}
                            className="flex items-baseline justify-between gap-4 border-b border-[var(--color-borde-sutil)] py-3 text-[14px]"
                        >
                            <span className="text-[var(--color-tenue)]">{f.label}</span>
                            {isWebAddress(value) ? (
                                <a
                                    href={value}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="min-w-0 truncate font-mono text-[13px] text-[var(--color-acento)] hover:underline"
                                >
                                    {shortenChannelUrl(value)} <span aria-hidden="true">↗</span>
                                </a>
                            ) : (
                                <span className="font-mono">{fieldValue(f.kind, value)}</span>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
