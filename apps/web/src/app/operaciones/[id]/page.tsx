import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ApiError } from '@marketplace/api-client';
import type { OperationDetailDto } from '@marketplace/api-contract';
import { UserRole } from '@marketplace/shared-types';
import { api } from '@/lib/api';
import { actorActual } from '@/lib/sesion';
import { Revelar } from '@/components/Revelar';
import { LineaTiempo } from '@/components/LineaTiempo';
import { AccionOperacion } from '@/components/AccionOperacion';
import { FormularioContraoferta } from '@/components/FormularioContraoferta';
import { EstadoOperacion, Panel, Titulo } from '@/components/ui';
import { monto } from '@/lib/formato';
import { avanzar, contraofertar, firmarContrato } from '../acciones';

/**
 * Detalle de una operación.
 *
 * Qué acciones se ofrecen sale de dos cosas: el estado de la operación y qué
 * posición ocupa quien mira. La API ya rechaza lo que no corresponde — acá
 * solo se evita ofrecer un botón que va a fallar.
 */
export default async function DetalleOperacion(props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;

    const actor = await actorActual();
    if (!actor) redirect('/ingresar');

    let op: OperationDetailDto;
    try {
        op = await api().operation(id);
    } catch (e) {
        if (e instanceof ApiError && (e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN')) notFound();
        throw e;
    }

    const esAdmin = actor.role === UserRole.ADMIN;
    const miTurno = op.miParte !== undefined && op.pendingResponseFrom === op.miParte;
    const negociando = op.status === 'offer_sent' || op.status === 'negotiating';
    const tripartito = op.contracts.find((c) => c.type === 'tripartite');

    // Mi propuesta anterior: contra ella se compara la convergencia, no contra
    // la que está sobre la mesa.
    const miUltima = op.miParte
        ? [...op.negotiations].reverse().find((n) => n.proposedBy === op.miParte)
        : undefined;

    return (
        <div className="mx-auto max-w-[1400px] px-6 py-14 sm:px-12">
            <Revelar>
                <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <EstadoOperacion estado={op.status} />
                        {op.miParte && (
                            <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">
                                SOS {op.miParte === 'buyer' ? 'EL COMPRADOR' : 'EL VENDEDOR'}
                            </span>
                        )}
                        {esAdmin && !op.miParte && (
                            <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-alerta)]">
                                MIRÁS COMO PLATAFORMA
                            </span>
                        )}
                    </div>

                    <Titulo sub={`Activo en venta · ${op.listingId.slice(0, 8)}`}>
                        {monto(op.finalPrice ?? op.currentOfferPrice)}
                    </Titulo>

                    <Link href={`/listings/${op.listingId}`} className="text-[14px] text-[var(--color-acento)]">
                        Ver la publicación →
                    </Link>
                </div>
            </Revelar>

            <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1fr]">
                <Revelar>
                    <Panel titulo="ETAPA DE LA OPERACIÓN">
                        <LineaTiempo actual={op.status} />
                    </Panel>
                </Revelar>

                <div className="flex flex-col gap-6">
                    {/* Reparto del dinero: solo existe una vez aceptada la oferta */}
                    {op.finalPrice && (
                        <Revelar>
                            <Panel titulo="REPARTO DEL DINERO">
                                <div className="flex flex-col gap-2.5 text-[14px]">
                                    <div className="flex justify-between">
                                        <span className="text-[var(--color-tenue)]">Precio acordado</span>
                                        <span className="font-mono">{monto(op.finalPrice)}</span>
                                    </div>
                                    {op.buyerPays && (
                                        <div className="flex justify-between">
                                            <span className="text-[var(--color-tenue)]">El comprador paga</span>
                                            <span className="font-mono">{monto(op.buyerPays)}</span>
                                        </div>
                                    )}
                                    {op.sellerReceives && (
                                        <div className="flex justify-between">
                                            <span className="text-[var(--color-tenue)]">El vendedor recibe</span>
                                            <span className="font-mono">{monto(op.sellerReceives)}</span>
                                        </div>
                                    )}
                                    {op.platformEarns && (
                                        <div className="flex justify-between border-t border-[var(--color-borde)] pt-2.5">
                                            <span className="text-[var(--color-tenue)]">Comisión de la plataforma</span>
                                            <span className="font-mono text-[var(--color-acento)]">
                                                {monto(op.platformEarns)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </Panel>
                        </Revelar>
                    )}

                    {/* Historial de la negociación */}
                    {op.negotiations.length > 0 && (
                        <Revelar retraso={80}>
                            <Panel titulo="HISTORIAL DE OFERTAS">
                                <div className="flex flex-col divide-y divide-[var(--color-borde-sutil)]">
                                    {op.negotiations.map((n, i) => (
                                        <div key={i} className="flex items-center justify-between py-2.5 text-[13px]">
                                            <span className="text-[var(--color-tenue)]">
                                                {n.proposedBy === 'buyer' ? 'Comprador' : 'Vendedor'}
                                            </span>
                                            <span className="font-mono">
                                                {monto({ cents: n.amount, currency: n.currency })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </Panel>
                        </Revelar>
                    )}

                    {/* Acciones disponibles según estado y posición */}
                    <Revelar retraso={160}>
                        <Panel titulo="QUÉ PODÉS HACER">
                            <div className="flex flex-col gap-5">
                                {negociando && miTurno && (
                                    <>
                                        <AccionOperacion
                                            accion={avanzar.bind(null, id, 'accept')}
                                            texto="Aceptar la oferta"
                                            nota="Al aceptar se cancelan automáticamente las demás ofertas sobre este activo."
                                        />
                                        <div className="border-t border-[var(--color-borde)] pt-5">
                                            <FormularioContraoferta
                                                accion={contraofertar.bind(null, id)}
                                                precioActual={Math.round(op.currentOfferPrice.cents / 100)}
                                                miParte={op.miParte!}
                                                miUltima={
                                                    miUltima ? Math.round(miUltima.amount / 100) : undefined
                                                }
                                            />
                                        </div>
                                    </>
                                )}

                                {negociando && !miTurno && op.miParte && (
                                    <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                        Le toca responder a{' '}
                                        {op.pendingResponseFrom === 'buyer' ? 'el comprador' : 'el vendedor'}.
                                        Cuando conteste vas a poder aceptar o contraofertar.
                                    </p>
                                )}

                                {op.status === 'contract_pending' && tripartito && op.miParte && (
                                    <AccionOperacion
                                        accion={firmarContrato.bind(null, id, tripartito.id)}
                                        texto="Firmar el contrato"
                                        nota="Requiere identidad verificada. Queda registrada la fecha y la IP."
                                    />
                                )}

                                {op.status === 'contract_signed' && op.miParte === 'seller' && (
                                    <AccionOperacion
                                        accion={avanzar.bind(null, id, 'transfer')}
                                        texto="Iniciar la transferencia"
                                        nota="Cedés la titularidad del activo a la plataforma."
                                    />
                                )}

                                {esAdmin && op.status === 'transfer_in_progress' && (
                                    <AccionOperacion
                                        accion={avanzar.bind(null, id, 'custody')}
                                        texto="Confirmar custodia del activo"
                                        nota="Punto de control: al confirmar, se le pide el pago al comprador."
                                    />
                                )}

                                {esAdmin && op.status === 'asset_in_custody' && (
                                    <AccionOperacion
                                        accion={avanzar.bind(null, id, 'payment')}
                                        texto="Confirmar el pago recibido"
                                    />
                                )}

                                {esAdmin && op.status === 'payment_received' && (
                                    <AccionOperacion
                                        accion={avanzar.bind(null, id, 'complete')}
                                        texto="Cerrar la operación"
                                        nota="Entrega el activo al comprador y liquida al vendedor."
                                    />
                                )}

                                {['offer_sent', 'negotiating', 'contract_pending'].includes(op.status) &&
                                    op.miParte && (
                                        <div className="border-t border-[var(--color-borde)] pt-5">
                                            <AccionOperacion
                                                accion={avanzar.bind(null, id, 'cancel')}
                                                texto="Cancelar la operación"
                                                variante="peligro"
                                                nota="Después de firmar el contrato ya no se puede cancelar."
                                            />
                                        </div>
                                    )}

                                {op.status === 'completed' && (
                                    <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                        La operación se cerró. El comprador tiene el activo y el vendedor
                                        cobró su parte.
                                    </p>
                                )}
                            </div>
                        </Panel>
                    </Revelar>
                </div>
            </div>
        </div>
    );
}
