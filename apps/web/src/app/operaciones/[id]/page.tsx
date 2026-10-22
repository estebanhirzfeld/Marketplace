import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ApiError } from '@marketplace/api-client';
import type { NextActionIdDto, OperationDetailDto, OperationRoleDto, PaymentOptionsDto } from '@marketplace/api-contract';
import { UserRole } from '@marketplace/shared-types';
import { api } from '@/lib/api';
import { currentActor } from '@/lib/session';
import { Reveal } from '@/components/Reveal';
import { Timeline } from '@/components/Timeline';
import { OperationAction } from '@/components/OperationAction';
import { CustodyVerificationForm } from '@/components/CustodyVerificationForm';
import { TransferInitiationForm } from '@/components/TransferInitiationForm';
import { DeliveryVerificationForm } from '@/components/DeliveryVerificationForm';
import { RecipientIdentityForm, RecipientIdentitySaved } from '@/components/RecipientIdentityForm';
import { ReportForm } from '@/components/ReportForm';
import { CounterOfferForm } from '@/components/CounterOfferForm';
import { PaymentChoice, SellerPaymentWait } from '@/components/PaymentChoice';
import { NextStepCard } from '@/components/NextStep';
import { RejectTransferForm } from '@/components/RejectTransferForm';
import { ReceiptReviewForm } from '@/components/ReceiptForms';
import { nextStepCopy, partyStatusLine } from '@/lib/nextStepCopy';
import { Alert, Button, OperationStatusBadge, Panel, Heading } from '@/components/ui';
import { nicheLabel, money, exactMoney, fechaLarga } from '@/lib/format';
import { assetTypeLabeller } from '@/lib/assetTypes';
import {
    advanceOperation,
    attestTransferStepAction,
    checkDomainCustodyAction,
    checkDomainDeliveryAction,
    completeOperation,
    confirmCustody,
    counterOffer,
    decideReceiptAction,
    declareRecipientIdentity,
    deliverDomainAction,
    goToCheckout,
    initiateTransfer,
    rejectTransferAction,
    signContract,
    uploadReceiptAction,
    requestReceiptReviewAction,
    addReviewBankReferenceAction,
    resolveReceiptCoherenceAction,
    resolveReceiptReviewAction,
    attachSellerStatementAction,
} from '../actions';
import { CoherenceReview, ReviewResolution, ReviewStatus, SellerReviewResponse } from '@/components/ReceiptReview';
import { AdminDomainTransferPanel, DomainDeliveryStatus, TransferStepsList } from '@/components/TransferSteps';
import { fileReport } from '../../denuncias/actions';

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
    const nombreDeTipo = await assetTypeLabeller();

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

    // Cómo puede pagar el comprador, mientras el activo está en custodia. La
    // plataforma también lo pide: ve los destinos para revisar comprobantes. Si
    // la consulta falla la pantalla no se rompe: queda el botón de pagar.
    let paymentOptions: PaymentOptionsDto | undefined;
    if ((isAdmin || op.miParte) && op.status === 'asset_in_custody') {
        try {
            paymentOptions = await api().paymentOptions(id);
        } catch {
            paymentOptions = undefined;
        }
    }
    const tripartito = op.contracts.find((c) => c.type === 'tripartite');

    // El comprobante en revisión, si lo hay, y las acciones del comprador para pedirla.
    const reviewed = op.paymentReceipts?.find((r) => r.status === 'in_review');
    const reviewActions = {
        request: {
            platform: requestReceiptReviewAction.bind(null, op.id, 'platform'),
            seller: requestReceiptReviewAction.bind(null, op.id, 'seller'),
        },
        addReference: {
            platform: addReviewBankReferenceAction.bind(null, op.id, 'platform'),
            seller: addReviewBankReferenceAction.bind(null, op.id, 'seller'),
        },
    };

    // La cuenta donde el vendedor tuvo que recibir lo suyo, para verificarla antes de confirmar.
    const sellerDestination = paymentOptions?.transfer.destinations?.find((d) => d.recipient === 'seller');
    let sellerAccount = sellerDestination?.recipient === 'seller'
        ? (sellerDestination.bankAccount.alias ?? sellerDestination.bankAccount.cbu)
        : undefined;
    if (!sellerAccount && op.miParte === 'seller' && op.paymentReceipts?.some((r) => r.recipient === 'seller')) {
        try {
            const own = (await api().bankAccounts()).find((a) => a.currency === op.buyerPays?.currency);
            sellerAccount = own?.alias ?? own?.cbu;
        } catch {
            sellerAccount = undefined;
        }
    }

    // El vendedor tiene un plazo para confirmar lo que le transfirieron; vencido, decide la plataforma.
    const sellerStep = op.next?.byRole.seller;
    const sellerReceiptOverdue =
        sellerStep?.kind === 'act' &&
        sellerStep.id === 'confirm_seller_receipt' &&
        !!sellerStep.deadline &&
        new Date(sellerStep.deadline).getTime() < new Date().getTime();

    // Qué le toca a quien mira, o a quién espera: lo calcula la API para los
    // tres roles con la misma regla, así lo que lee cada uno no se contradice.
    const role: OperationRoleDto = op.miParte ?? 'platform';
    const step = op.next?.byRole[role];
    const copy = op.next ? nextStepCopy(op.next, role, op.assetType) : undefined;

    // Mi propuesta anterior: contra ella se compara la convergencia, no contra
    // la que está sobre la mesa.
    const miUltima = op.miParte
        ? [...op.negotiations].reverse().find((n) => n.proposedBy === op.miParte)
        : undefined;

    /** Mirar un comprobante y responder si llegó, para quien recibió esa plata. */
    const receiptReview = (recipient: 'seller' | 'platform', expected?: string, account?: string) => (
        <ReceiptReviewForm
            fileHref={`/operaciones/${op.id}/comprobantes/${recipient}`}
            isImage={op.paymentReceipts?.find((r) => r.recipient === recipient)?.contentType.startsWith('image/') ?? false}
            expected={expected}
            account={account}
            confirmAction={decideReceiptAction.bind(null, op.id, recipient, true)}
            rejectAction={decideReceiptAction.bind(null, op.id, recipient, false)}
            confirmText="Confirmar la acreditación"
        />
    );

    /** El formulario de una acción, para quien la tiene que hacer. */
    const formFor = (id: NextActionIdDto, blocking: boolean) => {
        switch (id) {
            case 'respond_offer':
                return (
                    <div className="flex flex-col gap-5">
                        <OperationAction
                            action={advanceOperation.bind(null, op.id, 'accept')}
                            text="Aceptar la oferta"
                            note="Al aceptar se cancelan automáticamente las demás ofertas sobre este activo."
                        />
                        <div className="border-t border-[var(--color-borde)] pt-5">
                            <CounterOfferForm
                                action={counterOffer.bind(null, op.id, op.currentOfferPrice.currency)}
                                currency={op.currentOfferPrice.currency}
                                precioActual={Math.round(op.currentOfferPrice.cents / 100)}
                                miParte={op.miParte!}
                                miUltima={miUltima ? Math.round(miUltima.amount / 100) : undefined}
                            />
                        </div>
                    </div>
                );
            case 'sign_contract':
                return tripartito ? (
                    <div className="flex flex-col gap-3">
                        {/* Leer antes de firmar: el enlace va primero. */}
                        <Link href={`/contratos/${tripartito.id}`} className="text-[14px] text-[var(--color-acento)]">
                            Leer el contrato antes de firmar →
                        </Link>
                        <OperationAction
                            action={signContract.bind(null, op.id, tripartito.id)}
                            text="Firmar el contrato"
                            note="Requiere identidad verificada. Se registran la fecha, la IP y la huella del documento."
                        />
                    </div>
                ) : null;
            case 'register_platform_access':
                return (
                    <Link href={`/listings/${op.listingId}`} className="text-[14px] text-[var(--color-acento)]">
                        Registrar el acceso al activo →
                    </Link>
                );
            case 'declare_recipient':
                return (
                    <RecipientIdentityForm
                        action={declareRecipientIdentity.bind(null, op.id)}
                        urgente={blocking}
                        assetType={op.assetType}
                    />
                );
            case 'declare_handover':
                return (
                    <TransferInitiationForm
                        action={initiateTransfer.bind(null, op.id)}
                        steps={op.handoverSteps ?? []}
                        askSourceAccount={op.assetType === 'web'}
                    />
                );
            case 'move_domain_to_platform': {
                const traslado = op.handoverSteps?.find((s) => s.key === 'domain-to-platform');
                return traslado?.details ? (
                    <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] leading-relaxed text-[var(--color-tenue)]">
                        {traslado.details.map((d) => (
                            <li key={d}>{d}</li>
                        ))}
                    </ul>
                ) : null;
            }
            case 'verify_custody':
                // Un sitio se confirma solo al ver el dominio en nuestra cuenta: el
                // botón para comprobarlo está en las herramientas del traspaso.
                return op.assetType === 'web' ? null : <CustodyVerificationForm action={confirmCustody.bind(null, op.id)} />;
            case 'pay':
                return (
                    <PaymentChoice
                        options={paymentOptions}
                        buyerPays={op.buyerPays}
                        checkoutAction={goToCheckout.bind(null, op.id)}
                        receipts={op.paymentReceipts}
                        uploadActions={{
                            platform: uploadReceiptAction.bind(null, op.id, 'platform'),
                            seller: uploadReceiptAction.bind(null, op.id, 'seller'),
                        }}
                        reviewActions={reviewActions}
                    />
                );
            case 'link_payment_account':
                return <SellerPaymentWait options={paymentOptions} />;
            case 'confirm_seller_receipt':
                return receiptReview('seller', op.sellerReceives && exactMoney(op.sellerReceives), sellerAccount);
            case 'confirm_commission_receipt':
                return receiptReview('platform', op.platformEarns && exactMoney(op.platformEarns), 'de la plataforma');
            case 'respond_receipt_review':
                return (
                    <SellerReviewResponse
                        fileHref={`/operaciones/${op.id}/comprobantes/seller`}
                        amount={op.sellerReceives && exactMoney(op.sellerReceives)}
                        account={sellerAccount}
                        deadline={step?.kind === 'act' ? step.deadline : undefined}
                        confirmAction={decideReceiptAction.bind(null, op.id, 'seller', true)}
                        statementAction={attachSellerStatementAction.bind(null, op.id)}
                    />
                );
            case 'review_receipt':
                return reviewed ? (
                    <CoherenceReview
                        fileHref={`/operaciones/${op.id}/comprobantes/${reviewed.recipient}`}
                        facts={{
                            amount:
                                reviewed.recipient === 'seller'
                                    ? op.sellerReceives && exactMoney(op.sellerReceives)
                                    : op.platformEarns && exactMoney(op.platformEarns),
                            destination: reviewed.recipient === 'seller' ? sellerAccount : 'la cuenta de la plataforma',
                            destinationTaxId:
                                reviewed.recipient === 'seller' && sellerDestination?.recipient === 'seller'
                                    ? sellerDestination.bankAccount.holderTaxId
                                    : undefined,
                            custodyDate: op.custody ? fechaLarga(op.custody.verifiedAt) : undefined,
                            bankReference: reviewed.review?.bankReference,
                        }}
                        coherentAction={resolveReceiptCoherenceAction.bind(null, op.id, reviewed.recipient, true)}
                        incoherentAction={resolveReceiptCoherenceAction.bind(null, op.id, reviewed.recipient, false)}
                    />
                ) : null;
            case 'resolve_receipt_review':
                return reviewed ? (
                    <ReviewResolution
                        fileHref={`/operaciones/${op.id}/comprobantes/${reviewed.recipient}`}
                        statementHref={reviewed.review?.hasSellerStatement ? `/operaciones/${op.id}/movimientos` : undefined}
                        bankReference={reviewed.review?.bankReference}
                        creditedAction={resolveReceiptReviewAction.bind(null, op.id, reviewed.recipient, true)}
                        notCreditedAction={resolveReceiptReviewAction.bind(null, op.id, reviewed.recipient, false)}
                    />
                ) : null;
            case 'accept_delivery':
                return op.recipientIdentity ? (
                    <DomainDeliveryStatus
                        recipient={op.recipientIdentity.identifier}
                        progress={op.stepProgress?.find((p) => p.stepKey === 'domain-to-buyer')}
                    />
                ) : null;
            case 'deliver_asset':
                // La entrega de un dominio se inicia desde las herramientas del
                // traspaso, abajo; la de un canal se registra al terminarla.
                return op.assetType === 'web' ? null : (
                    <DeliveryVerificationForm
                        action={completeOperation.bind(null, op.id)}
                        recipientIdentifier={op.recipientIdentity?.identifier}
                    />
                );
            case 'complete_operation':
                return (
                    <DeliveryVerificationForm
                        action={completeOperation.bind(null, op.id)}
                        recipientIdentifier={op.recipientIdentity?.identifier}
                    />
                );
            case 'enable_payment_method':
                return null;
        }
    };

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
                            op.assetName ?? (op.niche
                                ? `${nicheLabel(op.niche)}${op.assetType ? ` · ${nombreDeTipo(op.assetType)}` : ''}`
                                : 'Activo en venta')
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
                        {op.next && <Timeline stages={op.next.timeline} cancelled={op.status === 'cancelled'} />}
                    </Panel>
                </Reveal>

                <div className="flex flex-col gap-6">
                    {/*
                      * La declaración del vendedor se guardaba y no se mostraba en
                      * ninguna parte, así que quien la hacía no veía aparecer nada y
                      * el paso parecía no hacer nada. Se muestra a las dos partes por
                      * el mismo motivo que la custodia: es lo que explica por qué la
                      * operación avanzó.
                      *
                      * Cuando la cuenta que el vendedor declaró no es la que después
                      * verificó la plataforma, la diferencia se nombra. No bloquea
                      * nada —el acceso se pudo haber vuelto a registrar en el medio
                      * por razones legítimas— pero tiene que ser visible: son dos
                      * copias congeladas en momentos distintos y compararlas es el
                      * único control que hay sobre ese tramo.
                      */}
                    {op.transferInitiation && (
                        <Reveal>
                            <Panel title="DECLARACIÓN DE CESIÓN DEL VENDEDOR">
                                <div className="flex flex-col gap-3 text-[14px]">
                                    <p className="text-[13px] leading-relaxed text-[var(--color-tenue)]">
                                        Declarada el {fechaLarga(op.transferInitiation.declaredAt)}.
                                    </p>

                                    {op.transferInitiation.controlCeded && (
                                        <ul className="flex flex-col gap-1.5">
                                            <CheckedItem text="El vendedor declaró haber cedido el control del activo" />
                                        </ul>
                                    )}

                                    {/*
                                      * Se nombra la cuenta como la reconoce una
                                      * persona —el correo que invitó—, no por su
                                      * identificador interno. Que la cuenta ya no
                                      * esté en el padrón no es lo mismo que no
                                      * haber registrado ninguna, y se dicen
                                      * distinto.
                                      */}
                                    <div className="flex justify-between border-t border-[var(--color-borde)] pt-3">
                                        <span className="text-[var(--color-tenue)]">
                                            Cuenta de custodia declarada
                                        </span>
                                        <span className="font-mono text-[13px]">
                                            {op.transferInitiation.custodyAccountIdentifier ??
                                                (op.transferInitiation.custodyAccountId
                                                    ? 'cuenta dada de baja'
                                                    : 'sin registrar')}
                                        </span>
                                    </div>

                                    {op.custody?.custodyAccountId &&
                                        op.transferInitiation.custodyAccountId &&
                                        op.custody.custodyAccountId !==
                                            op.transferInitiation.custodyAccountId && (
                                            <p className="rounded-[var(--radius-chico)] border border-[var(--color-alerta)]/50 bg-[var(--color-alerta)]/5 p-3 text-[13px] leading-relaxed">
                                                La cuenta que verificamos al tomar la custodia
                                                {op.custody.custodyAccountIdentifier ? (
                                                    <>
                                                        {' '}(
                                                        <span className="font-mono">
                                                            {op.custody.custodyAccountIdentifier}
                                                        </span>
                                                        ){' '}
                                                    </>
                                                ) : (
                                                    ' '
                                                )}
                                                no es la misma que estaba registrada cuando el vendedor
                                                declaró la cesión. El acceso se volvió a registrar en el
                                                medio. Queda asentado acá; no impide que la operación siga.
                                            </p>
                                        )}

                                    {op.transferInitiation.notes && (
                                        <p className="border-t border-[var(--color-borde)] pt-3 text-[13px] leading-relaxed text-[var(--color-tenue)]">
                                            {op.transferInitiation.notes}
                                        </p>
                                    )}
                                </div>
                            </Panel>
                        </Reveal>
                    )}

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

                                    {/*
                                      * La cuenta que la plataforma verificó, al lado
                                      * de la que el vendedor declaró en el panel de
                                      * arriba. Sin este renglón las dos copias
                                      * congeladas no se pueden comparar mirando la
                                      * pantalla, que es para lo que se congelan.
                                      */}
                                    <div className="flex justify-between border-t border-[var(--color-borde)] pt-3">
                                        <span className="text-[var(--color-tenue)]">
                                            Cuenta de custodia verificada
                                        </span>
                                        <span className="font-mono text-[13px]">
                                            {op.custody.custodyAccountIdentifier ??
                                                (op.custody.custodyAccountId
                                                    ? 'cuenta dada de baja'
                                                    : 'sin registrar')}
                                        </span>
                                    </div>

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

                    {/*
                      * La constancia de entrega, simétrica a la de custodia. Dice a
                      * qué identidad se entregó el activo de verdad y qué se
                      * atestiguó al cerrar.
                      */}
                    {op.delivery && (
                        <Reveal>
                            <Panel title="CONSTANCIA DE ENTREGA">
                                <div className="flex flex-col gap-3 text-[14px]">
                                    <p className="text-[13px] leading-relaxed text-[var(--color-tenue)]">
                                        Entregado el{' '}
                                        {new Date(op.delivery.verifiedAt).toLocaleDateString('es-AR', {
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric',
                                        })}{' '}
                                        a{' '}
                                        <span className="font-mono">
                                            {op.delivery.deliveredToIdentifier}
                                        </span>
                                        .
                                    </p>
                                    <ul className="flex flex-col gap-1.5">
                                        <CheckedItem text="El comprador quedó como propietario principal" />
                                        <CheckedItem text="Se cedieron los accesos" />
                                        {op.delivery.sellerRemoved && (
                                            <CheckedItem text="Se quitó al vendedor del activo" />
                                        )}
                                    </ul>
                                    {op.delivery.notes && (
                                        <p className="border-t border-[var(--color-borde)] pt-3 text-[13px] leading-relaxed text-[var(--color-tenue)]">
                                            {op.delivery.notes}
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

                    {/* Lo que le toca a quien mira, y lo demás que puede hacer */}
                    <Reveal delay={160}>
                        <div className="flex flex-col gap-6">
                            {query.pago === 'no-disponible' && (
                                <Alert tono="alerta">
                                    No pudimos abrir el pago. El activo sigue en custodia, así que no
                                    perdiste nada: probá de nuevo en unos minutos.
                                </Alert>
                            )}

                            {/* El motivo del rechazo, para que el vendedor sepa qué corregir antes de volver a ceder. */}
                            {op.miParte === 'seller' && op.status === 'contract_signed' && op.transferRejection && (
                                <Alert tono="alerta">Rechazamos tu cesión: {op.transferRejection.reason}</Alert>
                            )}

                            {copy && step && (
                                <NextStepCard
                                    copy={copy}
                                    meanwhile={step.kind === 'act' && !step.blocking ? formFor(step.id, false) : undefined}
                                >
                                    {step.kind === 'act' && step.blocking ? formFor(step.id, true) : null}
                                </NextStepCard>
                            )}

                            {/*
                                El admin opera: ve en qué está cada parte y tiene a mano las
                                herramientas del traspaso aunque el turno sea de otro.
                            */}
                            {isAdmin && op.next && (
                                <Panel title="LAS PARTES">
                                    <ul className="flex flex-col gap-2 text-[13px] leading-relaxed">
                                        <li>
                                            <span className="text-[var(--color-apagado)]">Comprador · </span>
                                            {partyStatusLine(op.next, 'buyer', op.assetType)}
                                        </li>
                                        <li>
                                            <span className="text-[var(--color-apagado)]">Vendedor · </span>
                                            {partyStatusLine(op.next, 'seller', op.assetType)}
                                        </li>
                                    </ul>
                                </Panel>
                            )}

                            {/*
                                El traspaso de un sitio paso a paso, desde que el vendedor
                                cedió el activo: él ve qué le falta; el admin, además, los
                                botones que lo hacen avanzar.
                            */}
                            {op.assetType === 'web' &&
                                (isAdmin || op.miParte === 'seller') &&
                                ['transfer_in_progress', 'asset_in_custody', 'payment_received', 'completed'].includes(
                                    op.status,
                                ) &&
                                (op.handoverSteps?.length ?? 0) > 0 && (
                                    <Panel title="PASOS DEL TRASPASO">
                                        <TransferStepsList steps={op.handoverSteps ?? []} progress={op.stepProgress ?? []} />
                                    </Panel>
                                )}

                            {isAdmin && op.assetType === 'web' && (
                                <AdminDomainTransferPanel
                                    status={op.status}
                                    steps={op.handoverSteps ?? []}
                                    progress={op.stepProgress ?? []}
                                    actions={{
                                        checkCustody: checkDomainCustodyAction.bind(null, id),
                                        attest: (stepKey) => attestTransferStepAction.bind(null, id, stepKey),
                                        deliver: deliverDomainAction.bind(null, id),
                                        checkDelivery: checkDomainDeliveryAction.bind(null, id),
                                    }}
                                />
                            )}

                            {/*
                                Si el vendedor declaró una cesión que no llegó, la operación
                                vuelve a «contrato firmado» con el motivo a su vista.
                            */}
                            {/* El comprador espera la revisión: sabe en qué está y puede sumar el ID COELSA. */}
                            {op.miParte === 'buyer' && reviewed && (
                                <Panel title="REVISIÓN DEL COMPROBANTE">
                                    <ReviewStatus
                                        hasBankReference={!!reviewed.review?.bankReference}
                                        addReferenceAction={reviewActions.addReference[reviewed.recipient]}
                                    />
                                </Panel>
                            )}

                            {isAdmin && op.status === 'transfer_in_progress' && (
                                <Panel title="SI LA CESIÓN NO LLEGÓ">
                                    <RejectTransferForm action={rejectTransferAction.bind(null, id)} />
                                </Panel>
                            )}

                            {/*
                                Si el vendedor no confirma su transferencia a tiempo, la
                                decide la plataforma con el comprobante a la vista.
                            */}
                            {isAdmin && sellerReceiptOverdue && (
                                <Panel title="EL VENDEDOR NO CONFIRMÓ SU TRANSFERENCIA">
                                    <div className="flex flex-col gap-3">
                                        <p className="text-[13px] leading-relaxed text-[var(--color-tenue)]">
                                            Venció su plazo para responder. Mirá el comprobante y decidí vos.
                                        </p>
                                        {receiptReview('seller', op.sellerReceives && exactMoney(op.sellerReceives), sellerAccount)}
                                    </div>
                                </Panel>
                            )}

                            {/* Con el dominio ya entregado, el comprador ve que lo tiene. */}
                            {op.miParte === 'buyer' && op.assetType === 'web' && op.recipientIdentity && op.status === 'completed' && (
                                <DomainDeliveryStatus
                                    recipient={op.recipientIdentity.identifier}
                                    progress={op.stepProgress?.find((p) => p.stepKey === 'domain-to-buyer')}
                                    completed
                                />
                            )}

                            {/*
                                Lo secundario, al final: corregir dónde recibir, cancelar
                                antes de firmar y reclamar después.
                            */}
                            {op.miParte === 'buyer' && op.recipientIdentity && op.status !== 'completed' && op.status !== 'cancelled' && (
                                <div className="flex flex-col gap-2 text-[13px]">
                                    <RecipientIdentitySaved identifier={op.recipientIdentity.identifier} assetType={op.assetType} />
                                    <details>
                                        <summary className="cursor-pointer text-[var(--color-tenue)]">Cambiar la cuenta</summary>
                                        <div className="mt-3">
                                            <RecipientIdentityForm
                                                action={declareRecipientIdentity.bind(null, id)}
                                                urgente={false}
                                                valorActual={op.recipientIdentity.identifier}
                                                assetType={op.assetType}
                                            />
                                        </div>
                                    </details>
                                </div>
                            )}

                            {['offer_sent', 'negotiating', 'contract_pending'].includes(op.status) && op.miParte && (
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
                                !['offer_sent', 'negotiating', 'contract_pending', 'cancelled'].includes(op.status) && (
                                    <div className="border-t border-[var(--color-borde)] pt-5">
                                        <ReportForm action={fileReport.bind(null, id)} />
                                    </div>
                                )}
                        </div>
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
