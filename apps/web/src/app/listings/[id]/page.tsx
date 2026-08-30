import { notFound } from 'next/navigation';
import { ApiError } from '@marketplace/api-client';
import type { ListingDetailDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { actorActual } from '@/lib/sesion';
import { Revelar } from '@/components/Revelar';
import { PanelNda } from '@/components/PanelNda';
import { FormularioOferta } from '@/components/FormularioOferta';
import { BotonEnlace, EstadoOperacion, Panel } from '@/components/ui';
import { Candado } from '@/components/Candado';
import { monto, numero, porcentaje } from '@/lib/formato';
import { firmarNda, ofertar } from './acciones';

/** Nombres legibles para las claves crudas que devuelve la strategy. */
const ETIQUETAS: Record<string, string> = {
    subscribers: 'Suscriptores',
    monthlyRevenueUsdCents: 'Ingreso mensual',
    currency: 'Moneda',
    growthFactor: 'Factor de crecimiento',
    isMonetized: 'Monetizado',
    audienceTopCountry: 'País principal de la audiencia',
    hasNoFaceContent: 'Contenido sin rostro',
    domainAuthority: 'Autoridad de dominio',
    followers: 'Seguidores',
    engagementRate: 'Engagement',
    platform: 'Plataforma',
    channel_url: 'URL del canal',
    channel_id: 'ID del canal',
    raw_metrics: 'Métricas crudas',
    has_strikes: 'Tiene strikes',
};

function valorLegible(clave: string, valor: unknown): string {
    if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
    if (clave === 'monthlyRevenueUsdCents' && typeof valor === 'number') {
        return monto({ cents: valor, currency: 'USD' });
    }
    if (clave === 'engagementRate' && typeof valor === 'number') return porcentaje(valor);
    if (typeof valor === 'number') return numero(valor);
    return String(valor);
}

export default async function DetalleListing(props: { params: Promise<{ id: string }> }) {
    // En Next 16 `params` es una promesa: el acceso sincrónico se eliminó.
    const { id } = await props.params;

    const actor = await actorActual();

    let listing: ListingDetailDto;
    try {
        listing = await api().listing(id);
    } catch (e) {
        if (e instanceof ApiError && e.code === 'NOT_FOUND') notFound();
        throw e;
    }

    const oculto = listing.hiddenFields.length > 0;
    const camposVisibles = Object.entries(listing.assetData);

    return (
        <div className="mx-auto max-w-[1400px] px-6 py-14 sm:px-12">
            <Revelar>
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <EstadoOperacion estado="offer_sent" />
                        {oculto && (
                            <span className="flex items-center gap-1.5 rounded-[var(--radius-chico)] border border-[var(--color-alerta)]/40 px-2.5 py-1">
                                <Candado />
                                <span className="font-mono text-[10px] text-[var(--color-alerta)]">
                                    CONFIDENCIAL
                                </span>
                            </span>
                        )}
                    </div>
                    <h1 className="text-[32px] font-bold tracking-[-0.03em] sm:text-[40px]">
                        {monto(listing.askingPrice)}
                    </h1>
                    <p className="text-[15px] text-[var(--color-tenue)]">
                        Valuación estimada por nuestra fórmula:{' '}
                        <span className="font-mono text-[var(--color-tinta)]">
                            {monto(listing.estimatedPrice)}
                        </span>
                    </p>
                </div>
            </Revelar>

            <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                {/* Datos del activo */}
                <Revelar>
                    <Panel titulo="DATOS DEL ACTIVO">
                        <div className="flex flex-col divide-y divide-[var(--color-borde-sutil)]">
                            {camposVisibles.map(([clave, valor]) => (
                                <div key={clave} className="flex items-center justify-between py-3 text-[14px]">
                                    <span className="text-[var(--color-tenue)]">
                                        {ETIQUETAS[clave] ?? clave}
                                    </span>
                                    <span className="font-mono">{valorLegible(clave, valor)}</span>
                                </div>
                            ))}

                            {/* Los campos ocultos se muestran como filas ciegas: el
                                comprador ve qué le falta, no un vacío inexplicable. */}
                            {listing.hiddenFields.map((campo) => (
                                <div key={campo} className="flex items-center justify-between py-3 text-[14px]">
                                    <span className="text-[var(--color-tenue)]">
                                        {ETIQUETAS[campo] ?? campo}
                                    </span>
                                    <span className="flex items-center gap-2">
                                        <Candado tamano={12} color="var(--color-fantasma)" />
                                        <span className="select-none font-mono text-[var(--color-fantasma)] blur-[3px]">
                                            ████████
                                        </span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </Panel>
                </Revelar>

                {/* Acción */}
                <Revelar retraso={100}>
                    <div className="flex flex-col gap-5">
                        {oculto && (
                            <PanelNda
                                accion={firmarNda.bind(null, id)}
                                camposOcultos={listing.hiddenFields.map((c) => ETIQUETAS[c] ?? c)}
                                autenticado={Boolean(actor)}
                            />
                        )}

                        <Panel titulo="HACER UNA OFERTA">
                            {actor ? (
                                <FormularioOferta
                                    accion={ofertar.bind(null, id)}
                                    precioPedido={Math.round(listing.askingPrice.cents / 100)}
                                />
                            ) : (
                                <div className="flex flex-col gap-4">
                                    <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                        Necesitás una cuenta para ofertar. Crearla es gratis y no te
                                        compromete a nada.
                                    </p>
                                    <BotonEnlace href="/ingresar" className="w-full">
                                        Ingresar para ofertar
                                    </BotonEnlace>
                                </div>
                            )}
                        </Panel>
                    </div>
                </Revelar>
            </div>
        </div>
    );
}
