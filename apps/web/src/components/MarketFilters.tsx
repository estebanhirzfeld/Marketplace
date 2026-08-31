import Link from 'next/link';
import type { ListingFiltersQuery } from '@marketplace/api-contract';
import { ASSET_NICHES } from '@marketplace/shared-types';
import { nicheLabel } from '@/lib/format';
import { Button } from './ui';

/**
 * Lo que el usuario escribe en el buscador, antes de traducirse a la consulta.
 *
 * Los precios viajan en la URL en unidades enteras y no en centavos: es lo que
 * la persona escribe y lo que va a ver si comparte el enlace. La conversión a
 * centavos la hace la pantalla, que es la que habla con la API.
 */
export interface FiltrosDeBusqueda {
    assetType?: string;
    niche?: string;
    onlyTransferable?: boolean;
    currency?: 'ARS' | 'USD';
    minPrice?: number;
    maxPrice?: number;
    minSubscribers?: number;
    onlyMonetized?: boolean;
    minDomainAuthority?: number;
    sort?: ListingFiltersQuery['sort'];
    direction?: ListingFiltersQuery['direction'];
}

const TIPOS = [
    { value: undefined, text: 'Todos' },
    { value: 'youtube', text: 'Canales de YouTube' },
    { value: 'web', text: 'Sitios web' },
] as const;

/**
 * Cambiar de tipo limpia los filtros propios del tipo anterior: los
 * suscriptores no significan nada en un sitio web, y arrastrarlos devolvería
 * una lista vacía sin que se entienda por qué. El orden sí se conserva.
 */
function hrefDeTipo(assetType: string | undefined, actuales: FiltrosDeBusqueda): string {
    const q = new URLSearchParams();

    const poner = (clave: string, valor: string | number | undefined) => {
        if (valor !== undefined) q.set(clave, String(valor));
    };

    poner('assetType', assetType);
    // El rubro y la transferibilidad valen para los dos tipos, así que
    // sobreviven al cambio igual que el precio y el orden.
    poner('niche', actuales.niche);
    if (actuales.onlyTransferable) q.set('onlyTransferable', 'true');
    poner('currency', actuales.currency);
    poner('minPrice', actuales.minPrice);
    poner('maxPrice', actuales.maxPrice);
    poner('sort', actuales.sort);
    poner('direction', actuales.direction);

    return q.toString() === '' ? '/listings' : `/listings?${q.toString()}`;
}

/**
 * Los filtros, en una columna al costado de los resultados.
 *
 * El tipo se elige con enlaces y el resto con un formulario GET. Las dos cosas
 * producen una URL, así que cada búsqueda se comparte, se indexa y funciona
 * sin JavaScript. El orden vive aparte, en la barra sobre la grilla, y viaja
 * como campo oculto para que buscar no lo pierda.
 */
export function MarketFilters({ actuales }: { actuales: FiltrosDeBusqueda }) {
    const esCanal = actuales.assetType === 'youtube';
    const esWeb = actuales.assetType === 'web';

    /*
     * En pantallas chicas el formulario de filtros completo se apilaba arriba
     * de los resultados: había que scrollear todo el panel para llegar al
     * primer activo. Plegado por defecto, y desplegado siempre de `lg` para
     * arriba mediante CSS —ver `[data-filtros]` en globals.css—, así que en
     * escritorio no cambia nada.
     *
     * Con `<details>` y no con estado de React para que esto siga siendo un
     * componente de servidor.
     */
    return (
        <details data-filtros className="lg:sticky lg:top-8">
            <summary className="mb-4 flex cursor-pointer list-none items-center justify-between rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] px-4 py-2.5 text-[14px] lg:hidden [&::-webkit-details-marker]:hidden">
                <span>Filtrar y ordenar</span>
                <span aria-hidden className="text-[var(--color-tenue)]">▾</span>
            </summary>
            <div className="flex flex-col gap-6">
            <Bloque titulo="TIPO DE ACTIVO">
                <nav className="flex flex-col gap-0.5">
                    {TIPOS.map((t) => {
                        const activo = actuales.assetType === t.value;
                        return (
                            <Link
                                key={t.text}
                                href={hrefDeTipo(t.value, actuales)}
                                aria-current={activo ? 'page' : undefined}
                                className={`rounded-[var(--radius-chico)] px-3 py-2 text-[13px] transition-colors ${
                                    activo
                                        ? 'bg-[var(--color-acento)]/[0.08] text-[var(--color-acento)]'
                                        : 'text-[var(--color-tenue)] hover:bg-[var(--color-superficie)] hover:text-[var(--color-tinta)]'
                                }`}
                            >
                                {t.text}
                            </Link>
                        );
                    })}
                </nav>
            </Bloque>

            <form method="get" action="/listings" className="flex flex-col gap-6">
                {/* El tipo lo eligen los enlaces y el orden la barra de arriba;
                    el formulario los conserva para no perderlos al buscar. */}
                {actuales.assetType && (
                    <input type="hidden" name="assetType" value={actuales.assetType} />
                )}
                {actuales.sort && <input type="hidden" name="sort" value={actuales.sort} />}
                {actuales.direction && (
                    <input type="hidden" name="direction" value={actuales.direction} />
                )}

                <Bloque titulo="RUBRO">
                    <Select name="niche" valor={actuales.niche ?? ''}>
                        <option value="">Todos</option>
                        {ASSET_NICHES.map((n) => (
                            <option key={n} value={n}>{nicheLabel(n)}</option>
                        ))}
                    </Select>
                </Bloque>

                <Bloque titulo="DISPONIBILIDAD">
                    <label className="flex items-start gap-2.5 text-[13px] text-[var(--color-tenue)]">
                        <input
                            type="checkbox"
                            name="onlyTransferable"
                            value="true"
                            defaultChecked={actuales.onlyTransferable}
                            className="mt-0.5 size-4 accent-[var(--color-listo)]"
                        />
                        <span className="flex flex-col gap-1">
                            Solo transferencia inmediata
                            <span className="text-[11px] leading-relaxed text-[var(--color-apagado)]">
                                La plataforma ya tiene el acceso, así que la entrega no queda
                                esperando ningún plazo.
                            </span>
                        </span>
                    </label>
                </Bloque>

                <Bloque titulo="PRECIO">
                    <div className="flex flex-col gap-3">
                        <Campo etiqueta="Moneda">
                            <Select name="currency" valor={actuales.currency ?? 'USD'}>
                                <option value="USD">Dólares</option>
                                <option value="ARS">Pesos</option>
                            </Select>
                        </Campo>

                        <div className="grid grid-cols-2 gap-2.5">
                            <Campo etiqueta="Desde">
                                <Numero name="minPrice" valor={actuales.minPrice} placeholder="0" />
                            </Campo>
                            <Campo etiqueta="Hasta">
                                <Numero
                                    name="maxPrice"
                                    valor={actuales.maxPrice}
                                    placeholder="Sin tope"
                                />
                            </Campo>
                        </div>
                    </div>
                </Bloque>

                {esCanal && (
                    <Bloque titulo="DEL CANAL">
                        <div className="flex flex-col gap-3">
                            <Campo etiqueta="Suscriptores desde">
                                <Numero
                                    name="minSubscribers"
                                    valor={actuales.minSubscribers}
                                    placeholder="0"
                                />
                            </Campo>

                            <label className="flex items-center gap-2.5 text-[13px] text-[var(--color-tenue)]">
                                <input
                                    type="checkbox"
                                    name="onlyMonetized"
                                    value="true"
                                    defaultChecked={actuales.onlyMonetized}
                                    className="size-4 accent-[var(--color-acento)]"
                                />
                                Solo monetizados
                            </label>
                        </div>
                    </Bloque>
                )}

                {esWeb && (
                    <Bloque titulo="DEL SITIO">
                        <Campo
                            etiqueta="Autoridad de dominio desde"
                            nota="Del 0 al 100. Estima cuánto pesa el dominio en buscadores."
                        >
                            <Numero
                                name="minDomainAuthority"
                                valor={actuales.minDomainAuthority}
                                placeholder="0"
                                max={100}
                            />
                        </Campo>
                    </Bloque>
                )}

                <div className="flex items-center gap-3">
                    <Button type="submit" className="flex-1 py-2.5 text-[13px]">
                        Buscar
                    </Button>
                    <Link
                        href="/listings"
                        className="text-[13px] text-[var(--color-tenue)] transition-colors hover:text-[var(--color-tinta)]"
                    >
                        Limpiar
                    </Link>
                </div>
            </form>
            </div>
        </details>
    );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-3">
            <h2 className="font-mono text-[12px] tracking-[0.08em] text-[var(--color-apagado)]">
                {titulo}
            </h2>
            {children}
        </div>
    );
}

function Campo({
    etiqueta,
    nota,
    children,
}: {
    etiqueta: string;
    nota?: string;
    children: React.ReactNode;
}) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-[var(--color-tenue)]">{etiqueta}</span>
            {children}
            {nota && <span className="text-[11px] leading-relaxed text-[var(--color-apagado)]">{nota}</span>}
        </label>
    );
}

const CONTROL =
    'h-10 w-full rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] bg-[var(--color-fondo)] px-3 text-[13px] outline-none transition-colors focus:border-[var(--color-acento)]';

function Select({
    name,
    valor,
    children,
}: {
    name: string;
    valor: string;
    children: React.ReactNode;
}) {
    return (
        <select name={name} defaultValue={valor} className={CONTROL}>
            {children}
        </select>
    );
}

function Numero({
    name,
    valor,
    placeholder,
    max,
}: {
    name: string;
    valor?: number;
    placeholder: string;
    max?: number;
}) {
    return (
        <input
            type="number"
            name={name}
            min={0}
            max={max}
            inputMode="numeric"
            defaultValue={valor ?? ''}
            placeholder={placeholder}
            className={`${CONTROL} font-mono`}
        />
    );
}
