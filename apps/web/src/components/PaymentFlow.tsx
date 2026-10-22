'use client';

import { useState } from 'react';
import type {
    PaymentOptionsDto,
    PaymentReceiptDto,
    ReceiptRecipientDto,
    TransferDestinationDto,
} from '@marketplace/api-contract';
import { exactMoney } from '@/lib/format';
import { rejectionText } from '@/lib/receiptCopy';
import { Alert, Button } from './ui';
import { SubmitButton } from './SubmitButton';
import { CopyValueButton } from './CopyValueButton';
import { FileAttach } from './FileAttach';
import { ReviewRequest, ReviewStatus } from './ReceiptReview';

type State = { error?: string; ok?: boolean; message?: string };
export type ReceiptUploadAction = (state: State, form: FormData) => Promise<State>;

/** Las acciones de la revisión de un comprobante rechazado, ya vinculadas por destino. */
export interface ReviewActions {
    request: Record<ReceiptRecipientDto, ReceiptUploadAction>;
    addReference: Record<ReceiptRecipientDto, ReceiptUploadAction>;
}

/*
 * Cómo paga el comprador, de a un paso. Primero elige el medio entre dos
 * tarjetas; con la transferencia hace dos, primero la comisión y después lo
 * del vendedor, y adjunta el comprobante de cada una. En qué paso está sale de
 * los comprobantes que ya subió, así que recargar la página no lo pierde.
 */

const CARD =
    'flex min-h-[240px] w-full flex-col gap-5 rounded-[var(--radius-grande)] border border-[var(--color-borde-fuerte)] bg-[var(--color-superficie)] p-6 text-left text-[var(--color-tinta)] transition-colors enabled:hover:border-[var(--color-acento)] disabled:cursor-not-allowed disabled:opacity-60';
const PANEL = 'flex flex-col gap-5 rounded-[var(--radius-grande)] border border-[var(--color-borde-fuerte)] bg-[var(--color-superficie)] p-6';
const TEXT = 'text-[15px] leading-relaxed text-[var(--color-tenue)]';

/** Por qué Mercado Pago no se puede usar, dicho al comprador. */
const MP_UNAVAILABLE: Record<NonNullable<PaymentOptionsDto['mercadopago']['reason']>, string> = {
    seller_not_linked: 'El vendedor todavía no habilitó Mercado Pago.',
    rate_unavailable: 'Mercado Pago no está disponible en este momento.',
    not_configured: 'Mercado Pago no está disponible en este momento.',
};

/** El paso de la transferencia en que está el comprador, según sus comprobantes. */
export function transferStage(receipts: readonly PaymentReceiptDto[]): 'platform' | 'seller' | 'done' {
    const pendingFor = (r: ReceiptRecipientDto) => {
        const receipt = receipts.find((x) => x.recipient === r);
        return !receipt || receipt.status === 'rejected';
    };
    if (pendingFor('platform')) return 'platform';
    if (pendingFor('seller')) return 'seller';
    return 'done';
}

export function PaymentFlow({
    options,
    receipts,
    checkoutAction,
    uploadActions,
    reviewActions,
    initialView = 'choose',
}: {
    options: PaymentOptionsDto;
    receipts: PaymentReceiptDto[];
    checkoutAction: () => Promise<void>;
    /** Una Server Action ya vinculada por destino: una función común no cruza al cliente. */
    uploadActions: Record<ReceiptRecipientDto, ReceiptUploadAction>;
    /** Sin ellas, un comprobante rechazado solo se reemplaza. */
    reviewActions?: ReviewActions;
    /** Para mostrar un estado en `/sistema`; en la operación siempre arranca eligiendo. */
    initialView?: 'choose' | 'mercadopago' | 'transfer-intro';
}) {
    // Con una transferencia empezada, ofrecer Mercado Pago sería invitar a pagar dos veces.
    const started = receipts.length > 0;
    const [view, setView] = useState<'choose' | 'mercadopago' | 'transfer-intro' | 'transfer'>(
        started ? 'transfer' : initialView,
    );
    const current = started ? 'transfer' : view;

    if (current === 'mercadopago') {
        return (
            <section className={PANEL} aria-labelledby="pago-mp">
                <h3 id="pago-mp" className="text-[20px] font-bold">
                    Pago con Mercado Pago
                </h3>
                <p className={TEXT}>
                    Te redirigiremos a Mercado Pago para realizar el pago. Luego de la acreditación, se realizará la
                    entrega del activo.
                </p>
                {options.mercadopago.converted && (
                    <p className={TEXT}>
                        Mercado Pago cobra en pesos: el monto se convierte con la cotización oficial del día y lo verás
                        antes de pagar.
                    </p>
                )}
                <form action={checkoutAction}>
                    <SubmitButton pendingText="Preparando el pago…">Ir a Mercado Pago</SubmitButton>
                </form>
                <BackButton onClick={() => setView('choose')} />
            </section>
        );
    }

    if (current === 'transfer-intro') {
        const [platform, seller] = orderedDestinations(options);
        return (
            <section className={PANEL} aria-labelledby="pago-intro">
                <h3 id="pago-intro" className="text-[20px] font-bold">
                    Realizarás 2 transferencias
                </h3>
                <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-relaxed">
                    <li>
                        La comisión, a la plataforma: <span className="font-mono">{platform && exactMoney(platform.amount)}</span>
                    </li>
                    <li>
                        El pago, al vendedor: <span className="font-mono">{seller && exactMoney(seller.amount)}</span>
                    </li>
                </ol>
                <p className={TEXT}>
                    Deberás adjuntar el comprobante. La revisión es manual y puede demorar: te avisaremos cuando estén
                    confirmados.
                </p>
                <Button type="button" className="self-start" onClick={() => setView('transfer')}>
                    Empezar
                </Button>
                <BackButton onClick={() => setView('choose')} />
            </section>
        );
    }

    if (current === 'transfer') {
        return <TransferSteps options={options} receipts={receipts} uploadActions={uploadActions} reviewActions={reviewActions} />;
    }

    const mp = options.mercadopago;
    const transfer = options.transfer;
    return (
        <div className="grid gap-4 sm:grid-cols-2">
            <button type="button" className={CARD} disabled={!mp.available} onClick={() => setView('mercadopago')}>
                {/* El logo ya nombra la opción: el título la repite para quien no lo ve. */}
                <img src="/logos/mercadopago.svg" alt="" className="h-[40px] w-auto self-start" />
                <span className="flex flex-col gap-2">
                    <span className="text-[22px] font-bold">Mercado Pago</span>
                    <span className={TEXT}>
                        {mp.available
                            ? 'Un solo pago, con tarjeta o dinero en cuenta. La acreditación es inmediata.'
                            : MP_UNAVAILABLE[mp.reason ?? 'not_configured']}
                    </span>
                </span>
                {mp.available && (
                    <span className="mt-auto flex justify-end border-t border-[var(--color-borde)] pt-4 text-[15px] font-medium text-[var(--color-acento)]">
                        Pagar con Mercado Pago
                    </span>
                )}
            </button>
            <button type="button" className={CARD} disabled={!transfer.available} onClick={() => setView('transfer-intro')}>
                <BankMark />
                <span className="flex flex-col gap-2">
                    <span className="text-[22px] font-bold">Transferencia</span>
                    <span className={TEXT}>
                        {transfer.available
                            ? 'Desde tu banco, en dos transferencias. La confirmación es manual.'
                            : 'La transferencia no está disponible por ahora.'}
                    </span>
                </span>
                {transfer.available && (
                    <span className="mt-auto flex justify-end border-t border-[var(--color-borde)] pt-4 text-[15px] font-medium text-[var(--color-acento)]">
                        Pagar por transferencia
                    </span>
                )}
            </button>
        </div>
    );
}

/** Primero la comisión, después el vendedor: el orden en que se piden. */
function orderedDestinations(options: PaymentOptionsDto): [TransferDestinationDto | undefined, TransferDestinationDto | undefined] {
    const d = options.transfer.destinations ?? [];
    return [d.find((x) => x.recipient === 'platform'), d.find((x) => x.recipient === 'seller')];
}

function TransferSteps({
    options,
    receipts,
    uploadActions,
    reviewActions,
}: {
    options: PaymentOptionsDto;
    receipts: PaymentReceiptDto[];
    uploadActions: Record<ReceiptRecipientDto, ReceiptUploadAction>;
    reviewActions?: ReviewActions;
}) {
    const stage = transferStage(receipts);
    const [platform, seller] = orderedDestinations(options);

    // Con un comprobante en revisión no hay nada que transferir: se espera la resolución.
    const inReview = receipts.find((r) => r.status === 'in_review');
    if (inReview) {
        return (
            <section className={PANEL} aria-label="Revisión del comprobante">
                <ReviewStatus
                    hasBankReference={!!inReview.review?.bankReference}
                    addReferenceAction={reviewActions?.addReference[inReview.recipient] ?? unavailable}
                />
            </section>
        );
    }

    if (stage === 'done') {
        return (
            <section className={PANEL} aria-labelledby="pago-listo">
                <h3 id="pago-listo" className="flex items-center gap-2.5 text-[20px] font-bold">
                    <CheckIcon />
                    Recibimos los dos comprobantes
                </h3>
                <p className={TEXT}>
                    La revisión es manual y puede demorar: te avisaremos cuando el pago esté confirmado. Luego se realizará
                    la entrega del activo.
                </p>
            </section>
        );
    }

    const destination = stage === 'platform' ? platform : seller;
    if (!destination) return <Alert tono="alerta">La transferencia no está disponible por ahora.</Alert>;
    const receipt = receipts.find((r) => r.recipient === destination.recipient);
    const step = stage === 'platform' ? 1 : 2;
    const platformReceived = receipts.some((r) => r.recipient === 'platform' && r.status !== 'rejected');

    return (
        <section className={PANEL} aria-labelledby="pago-paso">
            {stage === 'seller' && platformReceived && (
                <Alert tono="listo">Recibimos el comprobante de la comisión. Resta una transferencia: el pago al vendedor.</Alert>
            )}
            <div className="flex flex-col gap-2.5">
                <span className="font-mono text-[12px] text-[var(--color-tenue)]">PASO {step} DE 2</span>
                <div className="flex gap-1.5" aria-hidden="true">
                    <span className="h-1 flex-1 rounded-sm bg-[var(--color-acento)]" />
                    <span className={`h-1 flex-1 rounded-sm ${step === 2 ? 'bg-[var(--color-acento)]' : 'bg-[var(--color-borde-fuerte)]'}`} />
                </div>
                <h3 id="pago-paso" className="text-[20px] font-bold">
                    {stage === 'platform' ? 'La comisión, a la plataforma' : 'El pago, al vendedor'}
                </h3>
            </div>

            {receipt?.status === 'rejected' && (
                <Alert tono="alerta">
                    <strong>{stage === 'platform' ? 'La plataforma' : 'El vendedor'}</strong> rechazó el comprobante:{' '}
                    {rejectionText(receipt)}. Verificá la transferencia con tu banco y adjuntá un nuevo comprobante.
                </Alert>
            )}

            <div className="flex flex-col gap-1">
                <span className="text-[13px] text-[var(--color-apagado)]">Transferir exactamente</span>
                <span className="font-mono text-[28px]">{exactMoney(destination.amount)}</span>
            </div>

            <AccountData destination={destination} />

            {receipt?.status === 'rejected' && reviewActions && (
                <ReviewRequest action={reviewActions.request[destination.recipient]} recipient={destination.recipient} />
            )}

            <FileAttach key={`${destination.recipient}-${receipt?.uploadedAt ?? 'nuevo'}`} action={uploadActions[destination.recipient]} />
        </section>
    );
}

function AccountData({ destination }: { destination: TransferDestinationDto }) {
    if (destination.recipient === 'platform') {
        return (
            // Texto, nunca HTML: lo carga la plataforma, pero se escapa igual.
            <p className="whitespace-pre-line rounded-[var(--radius-chico)] border border-[var(--color-borde)] bg-[var(--color-fondo)] p-4 font-mono text-[14px] leading-relaxed">
                {destination.instructions}
            </p>
        );
    }
    const { cbu, alias, holder, holderTaxId } = destination.bankAccount;
    return (
        <dl className="flex flex-col divide-y divide-[var(--color-borde)] rounded-[var(--radius-chico)] border border-[var(--color-borde)]">
            {alias && <AccountRow label="Alias" value={alias} copy />}
            {cbu && <AccountRow label="CBU" value={cbu} copy />}
            <AccountRow label="A nombre de" value={holder} />
            {holderTaxId && <AccountRow label="CUIT" value={holderTaxId} />}
        </dl>
    );
}

function AccountRow({ label, value, copy = false }: { label: string; value: string; copy?: boolean }) {
    return (
        <div className="flex flex-col gap-1 px-4 py-3">
            <dt className="text-[12px] text-[var(--color-apagado)]">{label}</dt>
            <dd className="text-[15px]">{copy ? <CopyValueButton value={value} label={`Copiar ${label.toLowerCase()}`} /> : value}</dd>
        </div>
    );
}

async function unavailable(): Promise<State> {
    return { error: 'No pudimos registrar el dato. Probá de nuevo.' };
}

function BackButton({ onClick }: { onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className="min-h-[44px] self-start text-[14px] text-[var(--color-tenue)]">
            Elegir otro medio
        </button>
    );
}

function CheckIcon() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-listo)" strokeWidth="2" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
        </svg>
    );
}

/** Un banco: frontón y columnas, al tamaño del logo de Mercado Pago. */
function BankMark() {
    return (
        <svg width="56" height="40" viewBox="0 0 72 52" role="img" aria-label="Banco" className="self-start">
            <rect width="72" height="52" rx="13" fill="var(--color-tinta)" />
            <path d="M36 11 18 20h36z" fill="var(--color-fondo)" />
            <rect x="21" y="23" width="5" height="13" fill="var(--color-fondo)" />
            <rect x="33.5" y="23" width="5" height="13" fill="var(--color-fondo)" />
            <rect x="46" y="23" width="5" height="13" fill="var(--color-fondo)" />
            <rect x="17" y="38" width="38" height="4" rx="1" fill="var(--color-fondo)" />
        </svg>
    );
}
