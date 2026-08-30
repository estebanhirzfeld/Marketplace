import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ApiError } from '@marketplace/api-client';
import type { OperationDetailDto } from '@marketplace/api-contract';
import { UserRole } from '@marketplace/shared-types';
import { api } from '@/lib/api';
import { currentActor } from '@/lib/session';
import { Reveal } from '@/components/Reveal';
import { Timeline } from '@/components/Timeline';
import { OperationAction } from '@/components/OperationAction';
import { CustodyVerificationForm } from '@/components/CustodyVerificationForm';
import { ReportForm } from '@/components/ReportForm';
import { CounterOfferForm } from '@/components/CounterOfferForm';
import { Button, OperationStatusBadge, Panel, Heading } from '@/components/ui';
import { money } from '@/lib/format';
import {
    advanceOperation,
    confirmBankTransfer,
    confirmCustody,
    counterOffer,
    goToCheckout,
    signContract,
} from '../actions';
import { fileReport } from '../../denuncias/actions';

/**
 * Detalle de una operación.
 *
 * Qué acciones se ofrecen sale de dos cosas: el estado de la operación y qué
 * posición ocupa quien mira. La API ya rechaza lo que no corresponde — acá
 * solo se evita ofrecer un botón que va a fallar.
 */
export default async function DetalleOperacion(props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;

    const actor = await currentActor();
    if (!actor) redirect('/ingresar');

    let op: OperationDetailDto;
    try {
        op = await api().operation(id);
    } catch (e) {
        if (e instanceof ApiError && (e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN')) notFound();
        throw e;
    }

    const isAdmin = actor.role === UserRole.ADMIN;
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
            <Reveal>
                <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <OperationStatusBadge state={op.status} />
                        {op.miParte && (
                            <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">
                                SOS {op.miParte === 'buyer' ? 'EL COMPRADOR' : 'EL VENDEDOR'}
                            </span>
                        )}
                        {isAdmin && !op.miParte && (
                            <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-alerta)]">
                                MIRÁS COMO PLATFORM
                            </span>
                        )}
                    </div>

                    <Heading sub={`Activo en venta · ${op.listingId.slice(0, 8)}`}>
                        {money(op.finalPrice ?? op.currentOfferPrice)}
                    </Heading>

                    <Link href={`/listings/${op.listingId}`} className="text-[14px] text-[var(--color-acento)]">
                        Ver la publicación →
                    </Link>
                </div>
            </Reveal>

            <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1fr]">
                <Reveal>
                    <Panel title="ETAPA DE LA OPERACIÓN">
                        <Timeline actual={op.status} />
                    </Panel>
                </Reveal>

                <div className="flex flex-col gap-6">
                    {/*
                      * La constancia se muestra a las dos partes. Es lo que respalda
                      * pedirle el pago al comprador: ocultársela sería al revés.
                      */}
                    {op.custody && (
                        <Reveal>
                            <Panel title="VERIFICACIÓN DE LA CUSTODIA">
                                <div className="flex flex-col gap-3 text-[14px]">
                                    <p className="text-[13px] leading-relaxed text-[var(--color-tenue)]">
                                        Verificada el{' '}
                                        {new Date(op.custody.verifiedAt).toLocaleDateString('es-AR', {
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric',
                                        })}
                                        .
                                    </p>

                                    <ul className="flex flex-col gap-1.5">
                                        <CheckedItem text="La plataforma es propietaria principal del activo" />
                                        <CheckedItem text="Los accesos están asegurados" />
                                    </ul>

                                    {Object.entries(op.custody.metrics).length > 0 && (
                                        <div className="flex flex-col gap-1.5 border-t border-[var(--color-borde)] pt-3">
                                            {Object.entries(op.custody.metrics).map(([name, value]) => (
                                                <div key={name} className="flex justify-between">
                                                    <span className="text-[var(--color-tenue)]">{name}</span>
                                                    <span className="font-mono">
                                                        {value.toLocaleString('es-AR')}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {op.custody.notes && (
                                        <p className="border-t border-[var(--color-borde)] pt-3 text-[13px] leading-relaxed text-[var(--color-tenue)]">
                                            {op.custody.notes}
                                        </p>
                                    )}
                                </div>
                            </Panel>
                        </Reveal>
                    )}

                        {/* Reparto del dinero: solo existe una vez aceptada la oferta */}
                    {op.finalPrice && (
                        <Reveal>
                            <Panel title="REPARTO DEL DINERO">
                                <div className="flex flex-col gap-2.5 text-[14px]">
                                    <div className="flex justify-between">
                                        <span className="text-[var(--color-tenue)]">Precio acordado</span>
                                        <span className="font-mono">{money(op.finalPrice)}</span>
                                    </div>
                                    {op.buyerPays && (
                                        <div className="flex justify-between">
                                            <span className="text-[var(--color-tenue)]">El comprador paga</span>
                                            <span className="font-mono">{money(op.buyerPays)}</span>
                                        </div>
                                    )}
                                    {op.sellerReceives && (
                                        <div className="flex justify-between">
                                            <span className="text-[var(--color-tenue)]">El vendedor recibe</span>
                                            <span className="font-mono">{money(op.sellerReceives)}</span>
                                        </div>
                                    )}
                                    {op.platformEarns && (
                                        <div className="flex justify-between border-t border-[var(--color-borde)] pt-2.5">
                                            <span className="text-[var(--color-tenue)]">Comisión de la plataforma</span>
                                            <span className="font-mono text-[var(--color-acento)]">
                                                {money(op.platformEarns)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </Panel>
                        </Reveal>
                    )}

                    {/* Historial de la negociación */}
                    {op.negotiations.length > 0 && (
                        <Reveal delay={80}>
                            <Panel title="HISTORIAL DE OFERTAS">
                                <div className="flex flex-col divide-y divide-[var(--color-borde-sutil)]">
                                    {op.negotiations.map((n, i) => (
                                        <div key={i} className="flex items-center justify-between py-2.5 text-[13px]">
                                            <span className="text-[var(--color-tenue)]">
                                                {n.proposedBy === 'buyer' ? 'Comprador' : 'Vendedor'}
                                            </span>
                                            <span className="font-mono">
                                                {money({ cents: n.amount, currency: n.currency })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </Panel>
                        </Reveal>
                    )}

                    {/* Acciones disponibles según el estado y la posición */}
                    <Reveal delay={160}>
                        <Panel title="QUÉ PODÉS HACER">
                            <div className="flex flex-col gap-5">
                                {negociando && miTurno && (
                                    <>
                                        <OperationAction
                                            action={advanceOperation.bind(null, id, 'accept')}
                                            text="Aceptar la oferta"
                                            note="Al aceptar se cancelan automáticamente las demás ofertas sobre este activo."
                                        />
                                        <div className="border-t border-[var(--color-borde)] pt-5">
                                            <CounterOfferForm
                                                action={counterOffer.bind(null, id)}
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
                                        Cuando conteste vas a poder aceptar o counterOffer.
                                    </p>
                                )}

                                {op.status === 'contract_pending' && tripartito && op.miParte && (
                                    <div className="flex flex-col gap-3">
                                        {/* Leer antes de firmar: el enlace va primero. */}
                                        <Link
                                            href={`/contratos/${tripartito.id}`}
                                            className="text-[14px] text-[var(--color-acento)]"
                                        >
                                            Leer el contrato antes de firmar →
                                        </Link>
                                        <OperationAction
                                            action={signContract.bind(null, id, tripartito.id)}
                                            text="Firmar el contrato"
                                            note="Requiere identidad verificada. Se registran la fecha, la IP y la huella del documento."
                                        />
                                    </div>
                                )}

                                {op.status === 'contract_signed' && op.miParte === 'seller' && (
                                    <OperationAction
                                        action={advanceOperation.bind(null, id, 'transfer')}
                                        text="Iniciar la transferencia"
                                        note="Cedés la titularidad del activo a la plataforma."
                                    />
                                )}

                                {isAdmin && op.status === 'transfer_in_progress' && (
                                    <div className="flex flex-col gap-3">
                                        <p className="text-[13px] leading-relaxed text-[var(--color-tenue)]">
                                            Punto de control: al registrar la custodia se le pide el
                                            pago al comprador. Queda constancia de qué verificaste.
                                        </p>
                                        <CustodyVerificationForm
                                            action={confirmCustody.bind(null, id)}
                                        />
                                    </div>
                                )}

                                {op.miParte === 'buyer' && op.status === 'asset_in_custody' && (
                                    <div className="flex flex-col gap-3">
                                        <p className="text-[13px] leading-relaxed text-[var(--color-tenue)]">
                                            El activo ya está en custodia de la plataforma y
                                            verificado. Recién ahora corresponde pagar.
                                        </p>
                                        <form action={goToCheckout.bind(null, id)}>
                                            <Button type="submit" className="w-full">
                                                Pagar {op.buyerPays ? money(op.buyerPays) : ''}
                                            </Button>
                                        </form>
                                    </div>
                                )}

                                {isAdmin && op.status === 'asset_in_custody' && op.buyerPays && (
                                    <form
                                        action={confirmBankTransfer.bind(
                                            null,
                                            id,
                                            op.buyerPays.cents,
                                            op.buyerPays.currency,
                                        )}
                                    >
                                        <Button type="submit" variant="secundario" className="w-full">
                                            Registrar una transferencia recibida
                                        </Button>
                                    </form>
                                )}

                                {isAdmin && op.status === 'payment_received' && (
                                    <OperationAction
                                        action={advanceOperation.bind(null, id, 'complete')}
                                        text="Cerrar la operación"
                                        note="Entrega el activo al comprador y liquida al vendedor."
                                    />
                                )}

                                {['offer_sent', 'negotiating', 'contract_pending'].includes(op.status) &&
                                    op.miParte && (
                                        <div className="border-t border-[var(--color-borde)] pt-5">
                                            <OperationAction
                                                action={advanceOperation.bind(null, id, 'cancel')}
                                                text="Cancelar la operación"
                                                variant="peligro"
                                                note="Después de firmar el contrato ya no se puede cancelar."
                                            />
                                        </div>
                                    )}

                                {op.miParte &&
                                    !['offer_sent', 'negotiating', 'contract_pending', 'cancelled'].includes(
                                        op.status,
                                    ) && (
                                        <div className="border-t border-[var(--color-borde)] pt-5">
                                            <ReportForm action={fileReport.bind(null, id)} />
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
                    </Reveal>
                </div>
            </div>
        </div>
    );
}

/** Un ítem verificado de la constancia de custodia. */
function CheckedItem({ text }: { text: string }) {
    return (
        <li className="flex items-start gap-2 text-[13px] leading-relaxed">
            <span aria-hidden className="text-[var(--color-acento)]">✓</span>
            <span className="text-[var(--color-tenue)]">{text}</span>
        </li>
    );
}
