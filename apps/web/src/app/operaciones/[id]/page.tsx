import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ApiError } from '@marketplace/api-client';
import type { OperationDetailDto } from '@marketplace/api-contract';
import { UserRole } from '@marketplace/shared-types';
import { api } from '@/lib/api';
import { currentActor } from '@/lib/session';
import { Reveal } from '@/components/Reveal';
import { SubmitButton } from '@/components/SubmitButton';
import { Timeline } from '@/components/Timeline';
import { OperationAction } from '@/components/OperationAction';
import { CustodyVerificationForm } from '@/components/CustodyVerificationForm';
import { ReportForm } from '@/components/ReportForm';
import { CounterOfferForm } from '@/components/CounterOfferForm';
import { Button, OperationStatusBadge, Panel, Heading } from '@/components/ui';
import { assetTypeLabel, nicheLabel, money, fechaLarga } from '@/lib/format';
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
 * Qué está pasando y qué se espera de quien mira.
 *
 * El panel de acciones se armaba solo con los botones que correspondían, así
 * que en las etapas donde a alguien no le toca hacer nada quedaba vacío: el
 * vendedor apretaba "Iniciar la transferencia" y la pantalla se quedaba muda,
 * sin decirle si algo había salido mal o si simplemente había que esperar. Una
 * etapa en la que no hay que hacer nada es información, no un hueco.
 *
 * Devuelve siempre un texto: cubrir todas las combinaciones de estado y
 * posición es justamente el punto.
 */
function queEsperar(
    status: OperationDetailDto['status'],
    parte: 'buyer' | 'seller' | 'platform',
): string {
    if (status === 'cancelled') {
        return parte === 'platform'
            ? 'La operación se canceló. Si el activo no tiene otra operación en curso, volvió al mercado.'
            : 'Esta operación se canceló y no se puede retomar. El activo vuelve al mercado si no quedó ninguna otra operación en curso sobre él.';
    }

    if (status === 'completed') {
        return 'La operación se cerró. El comprador tiene el activo y el vendedor cobró su parte.';
    }

    if (status === 'offer_sent' || status === 'negotiating') {
        if (parte === 'platform') {
            return 'Las partes están negociando el precio. La plataforma no interviene hasta que una de las dos acepte.';
        }
        return 'Mientras el precio se negocia, cualquiera de los dos puede aceptar lo que está sobre la mesa o proponer otro monto. Aceptar cancela las demás ofertas sobre el activo.';
    }

    if (status === 'contract_pending') {
        if (parte === 'seller') {
            return 'El precio ya está acordado. Falta que firmen las dos partes: la venta no queda cerrada hasta entonces, y hasta firmar todavía se puede cancelar.';
        }
        if (parte === 'buyer') {
            return 'El precio ya está acordado. Falta que firmen las dos partes; hasta entonces todavía podés cancelar sin costo.';
        }
        return 'Las partes tienen que firmar el contrato tripartito. La plataforma firma sola con la primera de las dos.';
    }

    if (status === 'contract_signed') {
        if (parte === 'seller') {
            return 'El contrato está firmado y ya nos cediste el acceso al activo. Ahora completamos el cambio de titularidad: no necesitamos nada más de vos por ahora.';
        }
        if (parte === 'buyer') {
            return 'El contrato está firmado. Todavía no te toca pagar, y es a propósito: primero tomamos el activo en custodia y verificamos que lo tengamos de verdad. Si nunca llega, no pusiste un peso.';
        }
        return 'El contrato está firmado. Falta completar el cambio de titularidad para poder declarar la custodia.';
    }

    if (status === 'transfer_in_progress') {
        if (parte === 'seller') {
            return 'Estamos completando el cambio de titularidad sobre el activo que cediste. No hace falta que hagas nada: te avisamos cuando quede en nuestra custodia y le pidamos el pago al comprador.';
        }
        if (parte === 'buyer') {
            return 'Estamos tomando el activo en custodia. Recién cuando verifiquemos que lo tenemos de verdad te vamos a pedir la transferencia — si el activo nunca llega, no pusiste un peso.';
        }
        return 'Punto de control: hay que verificar el activo y declarar la custodia. Recién después se le pide el pago al comprador.';
    }

    if (status === 'asset_in_custody') {
        if (parte === 'seller') {
            return 'El activo ya está en nuestra custodia. Le pedimos el pago al comprador; cuando entre, te liquidamos tu parte y se cierra la operación.';
        }
        if (parte === 'buyer') {
            return 'El activo ya está en custodia de la plataforma y verificado. Recién ahora corresponde pagar.';
        }
        return 'El activo está en custodia. Se está esperando el pago del comprador; si entró por transferencia bancaria, se registra desde acá.';
    }

    // payment_received
    if (parte === 'seller') {
        return 'El comprador ya pagó y el dinero está retenido por la plataforma. Estamos entregándole el activo y liquidando tu parte.';
    }
    if (parte === 'buyer') {
        return 'Ya pagaste y el dinero quedó retenido por la plataforma. Estamos entregándote el activo; cuando termine, la operación se cierra.';
    }
    return 'El pago está confirmado. Falta entregar el activo al comprador, liquidar al vendedor y cerrar la operación.';
}

/**
 * Detalle de una operación.
 *
 * Qué acciones se ofrecen sale de dos cosas: el estado de la operación y qué
 * posición ocupa quien mira. La API ya rechaza lo que no corresponde — acá
 * solo se evita ofrecer un botón que va a fallar.
 */
export default async function DetalleOperacion(props: {
    params: Promise<{ id: string }>;
    // En Next 16 `searchParams` es una promesa: el acceso sincrónico se eliminó.
    searchParams: Promise<{ pago?: string }>;
}) {
    const { id } = await props.params;
    const query = await props.searchParams;

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
                                MIRÁS COMO PLATAFORMA
                            </span>
                        )}
                        {/* Con quién se está negociando. Antes solo se veía el
                            rol, así que las dos partes discutían un precio
                            contra alguien sin nombre. */}
                        <span className="text-[13px] text-[var(--color-tenue)]">
                            {op.miParte
                                ? `Con ${op.miParte === 'buyer' ? op.seller.fullName : op.buyer.fullName}`
                                : `${op.buyer.fullName} · ${op.seller.fullName}`}
                        </span>
                    </div>

                    <Heading sub={
                            // Era los primeros ocho caracteres del UUID, que no le
                            // dice nada a nadie. El rubro y el tipo son públicos:
                            // nombran el activo sin revelar cuál es.
                            op.niche
                                ? `${nicheLabel(op.niche)}${op.assetType ? ` · ${assetTypeLabel(op.assetType)}` : ''}`
                                : 'Activo en venta'
                        }>
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
                                {/*
                                    El cobro puede no estar disponible —la API
                                    responde 503 sin credenciales de la pasarela— y
                                    el comprador volvía acá sin ningún aviso: el
                                    botón parecía recargar la página y nada más.
                                */}
                                {/*
                                    Siempre primero: en qué está la operación y qué
                                    se espera de quien mira. Los botones vienen
                                    después, y el reclamo al final de todo.
                                */}
                                <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                    {queEsperar(op.status, op.miParte ?? 'platform')}
                                </p>

                                {query.pago === 'no-disponible' && (
                                    <div className="rounded-[var(--radius-chico)] border border-[var(--color-alerta)]/40 p-4 text-[13px] leading-relaxed text-[var(--color-alerta)]">
                                        No pudimos abrir el pago: la pasarela todavía no está
                                        configurada en este entorno. El activo sigue en nuestra
                                        custodia, así que no perdiste nada — probá de nuevo más
                                        tarde o escribinos.
                                    </div>
                                )}
                                {query.pago === 'rechazado' && (
                                    <div className="rounded-[var(--radius-chico)] border border-[var(--color-alerta)]/40 p-4 text-[13px] leading-relaxed text-[var(--color-alerta)]">
                                        El pago no se pudo registrar. El activo sigue en nuestra
                                        custodia y la operación no avanzó: podés volver a
                                        intentarlo.
                                    </div>
                                )}
                                {query.pago === 'simulado' && (
                                    <div className="rounded-[var(--radius-chico)] border border-[var(--color-listo)]/40 p-4 text-[13px] leading-relaxed text-[var(--color-listo)]">
                                        Pago simulado registrado. En este entorno no se movió
                                        plata de verdad.
                                    </div>
                                )}
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
                                        Ahora le toca responder{' '}
                                        {op.pendingResponseFrom === 'buyer' ? 'al comprador' : 'al vendedor'}.
                                    </p>
                                )}

                                {op.status === 'contract_pending' && op.miParte && (
                                    <div className="flex flex-col gap-3">
                                        {!tripartito ? (
                                            <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                                Estamos preparando el contrato de esta operación.
                                                Apenas esté vas a poder leerlo y firmarlo desde acá.
                                            </p>
                                        ) : (
                                            <>
                                                {/* Leer antes de firmar: el enlace va primero. */}
                                                <Link
                                                    href={`/contratos/${tripartito.id}`}
                                                    className="text-[14px] text-[var(--color-acento)]"
                                                >
                                                    Leer el contrato antes de firmar →
                                                </Link>
                                                {/*
                                                    Firmar exige que la plataforma ya pueda tomar la
                                                    custodia del activo. Ofrecer el botón igual dejaba
                                                    a las dos partes apretando contra un error que la
                                                    pantalla nunca les había anticipado.
                                                */}
                                                {op.transferable ? (
                                                    <OperationAction
                                                        action={signContract.bind(null, id, tripartito.id)}
                                                        text="Firmar el contrato"
                                                        note="Requiere identidad verificada. Se registran la fecha, la IP y la huella del documento."
                                                    />
                                                ) : (
                                                    <p className="rounded-[var(--radius-chico)] border border-[var(--color-borde)] p-4 text-[13px] leading-relaxed text-[var(--color-tenue)]">
                                                        {op.transferableFrom
                                                            ? `El activo está en su período de espera: recién se puede transferir a partir del ${fechaLarga(op.transferableFrom)}. La firma se habilita ese día, para que nadie quede comprometido con una operación que todavía no podemos cerrar.`
                                                            : op.miParte === 'seller'
                                                              ? 'Para habilitar la firma necesitamos que nos des acceso al activo: sin eso no podemos garantizar la custodia y nadie debería quedar comprometido. Te vamos a escribir para coordinarlo.'
                                                              : 'Todavía no tomamos la custodia del activo, así que la firma no se habilita. Lo estamos coordinando con el vendedor y te avisamos apenas esté.'}
                                                    </p>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}

                                {/*
                                    El paso que le toca a la plataforma en esta etapa. No es
                                    ceremonia: sin la constancia de acceso el dominio rechaza la
                                    firma, así que la operación queda detenida esperándonos.
                                */}
                                {isAdmin && op.status === 'contract_pending' && !op.transferable && (
                                    <div className="flex flex-col gap-3">
                                        <p className="text-[13px] leading-relaxed text-[var(--color-tenue)]">
                                            {op.transferableFrom
                                                ? `Ya tenemos acceso al activo. El período de espera termina el ${fechaLarga(op.transferableFrom)} y recién ahí las partes pueden firmar.`
                                                : 'Las partes no pueden firmar hasta que dejemos constancia de que tenemos acceso al activo. Es el próximo paso y es nuestro.'}
                                        </p>
                                        {!op.transferableFrom && (
                                            <Link
                                                href={`/listings/${op.listingId}`}
                                                className="text-[14px] text-[var(--color-acento)]"
                                            >
                                                Registrar el acceso al activo →
                                            </Link>
                                        )}
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
                                    <CustodyVerificationForm action={confirmCustody.bind(null, id)} />
                                )}

                                {op.miParte === 'buyer' && op.status === 'asset_in_custody' && (
                                    <form action={goToCheckout.bind(null, id)}>
                                            <SubmitButton
                                                className="w-full"
                                                pendingText="Preparando el pago…"
                                            >
                                                Pagar {op.buyerPays ? money(op.buyerPays) : ''}
                                        </SubmitButton>
                                    </form>
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
                                        <SubmitButton
                                            variant="secundario"
                                            className="w-full"
                                            pendingText="Registrando…"
                                        >
                                            Registrar una transferencia recibida
                                        </SubmitButton>
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
