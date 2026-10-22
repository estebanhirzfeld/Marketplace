import type {
    MoneyDto,
    PaymentOptionsDto,
    PaymentReceiptDto,
    ReceiptRecipientDto,
    TransferDestinationDto,
} from '@marketplace/api-contract';
import { exactMoney, money } from '@/lib/format';
import { Alert, Button, ButtonLink } from './ui';
import { SubmitButton } from './SubmitButton';
import { ReceiptUploadForm } from './ReceiptForms';
import { rejectionText } from '@/lib/receiptCopy';

type FormAction = (state: { error?: string; ok?: boolean; message?: string }, form: FormData) => Promise<{
    error?: string;
    ok?: boolean;
    message?: string;
}>;

/**
 * Cómo paga el comprador.
 *
 * Quien llega acá lo hace una vez, con el activo ya en custodia, a decidir
 * CÓMO pagar, y se va cuando pagó o cuando sabe exactamente cómo hacerlo. Por
 * eso hay una sola decisión con dos opciones, cada una con lo necesario para
 * ejecutarla ahí mismo y nada más.
 *
 * Es presentacional: recibe la acción de pago, así `/sistema` puede mostrarlo
 * en cada estado sin tocar nada real.
 */

const ESTILO_OPCION =
    'flex flex-col gap-3 rounded-[var(--radius-chico)] border border-[var(--color-borde)] p-4';
const ESTILO_TEXTO = 'text-[14px] leading-relaxed text-[var(--color-tenue)]';

/** Qué se le dice al comprador cuando Mercado Pago no se puede usar. */
const MOTIVO_NO_DISPONIBLE: Record<
    NonNullable<PaymentOptionsDto['mercadopago']['reason']>,
    string
> = {
    seller_not_linked: 'El vendedor todavía no habilitó Mercado Pago. Podés pagar por transferencia.',
    rate_unavailable: 'Mercado Pago no está disponible en este momento. Podés pagar por transferencia.',
    not_configured: 'Mercado Pago no está disponible en este momento. Podés pagar por transferencia.',
};

export function PaymentChoice({
    options,
    buyerPays,
    checkoutAction,
    receipts = [],
    uploadAction,
}: {
    /** `undefined` cuando no se pudieron consultar: se cae a lo que había antes. */
    options?: PaymentOptionsDto;
    /** Lo que paga el comprador, para el botón de respaldo cuando no hay `options`. */
    buyerPays?: MoneyDto;
    checkoutAction: () => Promise<void>;
    /** Los comprobantes que ya subió, uno por transferencia. */
    receipts?: PaymentReceiptDto[];
    /** Sube el comprobante de una de las dos transferencias. */
    uploadAction?: (recipient: ReceiptRecipientDto) => FormAction;
}) {
    if (!options) {
        return (
            <form action={checkoutAction}>
                <SubmitButton className="w-full" pendingText="Preparando el pago…">
                    Pagar {buyerPays ? money(buyerPays) : ''}
                </SubmitButton>
            </form>
        );
    }

    const { mercadopago, transfer } = options;

    // Dos opciones muertas serían dos callejones: se dice una sola vez y se
    // deja el reclamo, que es la salida que existe.
    if (!mercadopago.available && !transfer.available) {
        return (
            <Alert tono="alerta">
                Por ahora no podés pagar desde acá. El activo sigue en custodia, así que no
                perdiste nada. Abrí un reclamo más abajo y te ayudamos a resolverlo.
            </Alert>
        );
    }

    // Con una transferencia ya hecha, ofrecer Mercado Pago sería invitar a pagar dos veces.
    if (receipts.length > 0 && transfer.available) {
        return (
            <section aria-labelledby="elegir-pago" className="flex flex-col gap-4">
                <h3 id="elegir-pago" className="text-[17px] font-medium">
                    Tus transferencias
                </h3>
                <TransferOption options={options} receipts={receipts} uploadAction={uploadAction} />
            </section>
        );
    }

    return (
        <section aria-labelledby="elegir-pago" className="flex flex-col gap-4">
            <h3 id="elegir-pago" className="text-[17px] font-medium">
                Elegí cómo pagar
            </h3>
            <MercadoPagoOption options={options} checkoutAction={checkoutAction} />
            <TransferOption options={options} receipts={receipts} uploadAction={uploadAction} />
        </section>
    );
}

function MercadoPagoOption({
    options,
    checkoutAction,
}: {
    options: PaymentOptionsDto;
    checkoutAction: () => Promise<void>;
}) {
    const { mercadopago } = options;

    return (
        <div className={ESTILO_OPCION}>
            <span className="text-[15px] font-medium">Mercado Pago</span>
            <p className={ESTILO_TEXTO}>Pagás en la página de Mercado Pago y volvés acá.</p>
            {mercadopago.converted && (
                <p className={ESTILO_TEXTO}>
                    Como la operación está en {options.currency}, se cobra en pesos, a la cotización
                    oficial del día. Vas a ver el monto en pesos antes de pagar.
                </p>
            )}
            {mercadopago.available ? (
                <form action={checkoutAction}>
                    <SubmitButton className="w-full" pendingText="Preparando el pago…">
                        Pagar con Mercado Pago
                    </SubmitButton>
                </form>
            ) : (
                <>
                    {/* Deshabilitado de verdad: sin un envío que vaya a fallar. */}
                    <Button
                        type="button"
                        disabled
                        className="w-full"
                        aria-describedby="mercadopago-motivo"
                    >
                        Pagar con Mercado Pago
                    </Button>
                    <p id="mercadopago-motivo" className={ESTILO_TEXTO}>
                        {MOTIVO_NO_DISPONIBLE[mercadopago.reason ?? 'not_configured']}
                    </p>
                </>
            )}
        </div>
    );
}

function TransferOption({
    options,
    receipts,
    uploadAction,
}: {
    options: PaymentOptionsDto;
    receipts: PaymentReceiptDto[];
    uploadAction?: (recipient: ReceiptRecipientDto) => FormAction;
}) {
    const { transfer } = options;

    if (!transfer.available) {
        return (
            <div className={ESTILO_OPCION}>
                <span className="text-[15px] font-medium">Transferencia bancaria</span>
                <p className={ESTILO_TEXTO}>
                    La transferencia no está disponible por ahora. Si la necesitás, abrí un reclamo
                    más abajo y te ayudamos.
                </p>
            </div>
        );
    }

    // Sin los destinos (una respuesta vieja), queda la cuenta única de antes.
    if (!transfer.destinations) {
        return (
            <div className={ESTILO_OPCION}>
                <span className="text-[15px] font-medium">Transferencia bancaria</span>
                <p className={ESTILO_TEXTO}>
                    Transferí exactamente{' '}
                    <span className="font-mono text-[var(--color-tinta)]">{exactMoney(options.amount)}</span> a
                    esta cuenta:
                </p>
                {/* Texto, nunca HTML: lo carga la plataforma, pero se escapa igual. */}
                <p className="whitespace-pre-line rounded-[var(--radius-chico)] border border-[var(--color-borde)] bg-[var(--color-fondo)] p-3 font-mono text-[13px] leading-relaxed">
                    {transfer.instructions}
                </p>
                <p className={ESTILO_TEXTO}>
                    Indicá esta referencia:{' '}
                    <span className="font-mono text-[var(--color-tinta)]">{transfer.reference}</span>
                </p>
            </div>
        );
    }

    return (
        <div className={ESTILO_OPCION}>
            <span className="text-[15px] font-medium">Transferencia bancaria</span>
            {/* El porqué de las dos cuentas, en una línea: cada uno recibe lo suyo. */}
            <p className={ESTILO_TEXTO}>
                Son dos transferencias: lo del vendedor va directo a su cuenta y la comisión, a la de
                la plataforma. Después de cada una, subí el comprobante.
            </p>
            <p className={ESTILO_TEXTO}>
                En las dos, indicá esta referencia:{' '}
                <span className="font-mono text-[var(--color-tinta)]">{transfer.reference}</span>
            </p>
            {transfer.destinations.map((d) => (
                <TransferDestination
                    key={d.recipient}
                    destination={d}
                    receipt={receipts.find((r) => r.recipient === d.recipient)}
                    uploadAction={uploadAction?.(d.recipient)}
                />
            ))}
        </div>
    );
}

const DESTINATION_TITLE: Record<ReceiptRecipientDto, string> = {
    seller: 'Al vendedor',
    platform: 'La comisión, a la plataforma',
};

function TransferDestination({
    destination,
    receipt,
    uploadAction,
}: {
    destination: TransferDestinationDto;
    receipt?: PaymentReceiptDto;
    uploadAction?: FormAction;
}) {
    return (
        <div className="flex flex-col gap-2.5 border-t border-[var(--color-borde)] pt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[14px] font-medium">{DESTINATION_TITLE[destination.recipient]}</span>
                <span className="font-mono text-[14px] text-[var(--color-tinta)]">{exactMoney(destination.amount)}</span>
            </div>
            {destination.recipient === 'seller' ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[13px]">
                    {destination.bankAccount.cbu && (
                        <>
                            <dt className="text-[var(--color-apagado)]">CBU</dt>
                            <dd>{destination.bankAccount.cbu}</dd>
                        </>
                    )}
                    {destination.bankAccount.alias && (
                        <>
                            <dt className="text-[var(--color-apagado)]">Alias</dt>
                            <dd>{destination.bankAccount.alias}</dd>
                        </>
                    )}
                    <dt className="text-[var(--color-apagado)]">Titular</dt>
                    <dd>{destination.bankAccount.holder}</dd>
                </dl>
            ) : (
                <p className="whitespace-pre-line rounded-[var(--radius-chico)] border border-[var(--color-borde)] bg-[var(--color-fondo)] p-3 font-mono text-[13px] leading-relaxed">
                    {destination.instructions}
                </p>
            )}
            <ReceiptState receipt={receipt} uploadAction={uploadAction} />
        </div>
    );
}

/** En qué está el comprobante de una transferencia, y subirlo si falta o lo rechazaron. */
function ReceiptState({ receipt, uploadAction }: { receipt?: PaymentReceiptDto; uploadAction?: FormAction }) {
    if (receipt?.status === 'confirmed') {
        return <Alert tono="listo">Confirmada: la transferencia llegó.</Alert>;
    }
    if (receipt?.status === 'pending') {
        return <p className={ESTILO_TEXTO}>Comprobante enviado. Falta que confirmen que llegó.</p>;
    }
    return (
        <>
            {receipt?.status === 'rejected' && (
                <Alert tono="alerta">
                    Rechazaron este comprobante: {rejectionText(receipt)}
                </Alert>
            )}
            {uploadAction && <ReceiptUploadForm action={uploadAction} replacing={receipt?.status === 'rejected'} />}
        </>
    );
}

/**
 * Si corresponde mostrar la espera del pago al vendedor.
 *
 * Solo el vendedor, y solo con el activo en custodia. Un administrador mira
 * como plataforma aunque figure como parte: no cobra, así que no se le habla
 * como a quien cobra.
 */
export function showSellerPaymentWait({
    status,
    miParte,
    isAdmin,
}: {
    status: string;
    miParte?: 'buyer' | 'seller';
    isAdmin: boolean;
}): boolean {
    return !isAdmin && miParte === 'seller' && status === 'asset_in_custody';
}

/**
 * Lo que ve el vendedor mientras el comprador paga.
 *
 * No hay nada que decidir: la única cosa que puede hacer es asegurarse de que
 * el comprador pueda pagar con Mercado Pago, y solo si su cuenta no está
 * vinculada. Cuando falta la cotización o la pasarela no depende de él, así
 * que no se le ofrece nada.
 */
export function SellerPaymentWait({ options }: { options?: PaymentOptionsDto }) {
    const needsLink = options?.mercadopago.reason === 'seller_not_linked';
    const needsBank = options?.transfer.reason === 'seller_bank_missing';
    const buyerCanPay = options?.mercadopago.available === true || options?.transfer.available === true;

    // Sin ningún medio, lo que falta es dónde cobra él: es su tarea, no una espera.
    if (!buyerCanPay && (needsLink || needsBank)) {
        return (
            <section
                aria-labelledby="donde-cobrar"
                className="flex flex-col gap-3 rounded-[var(--radius-chico)] border border-[var(--color-borde)] p-4"
            >
                <h3 id="donde-cobrar" className="text-[15px] font-medium">
                    Decinos dónde cobrar
                </h3>
                <p className={ESTILO_TEXTO}>
                    {needsLink && needsBank
                        ? 'El comprador no puede pagar hasta que vincules Mercado Pago o declares la cuenta bancaria donde querés recibir la transferencia. Con una alcanza.'
                        : needsLink
                          ? 'El comprador no puede pagar hasta que vincules tu cuenta de Mercado Pago.'
                          : 'El comprador no puede pagar hasta que declares la cuenta bancaria donde querés recibir la transferencia.'}
                </p>
                <div className="flex flex-wrap gap-3">
                    {needsLink && <ButtonLink href="/perfil#mercadopago">Vincular Mercado Pago</ButtonLink>}
                    {needsBank && (
                        <ButtonLink href="/perfil#cuenta-bancaria" variant={needsLink ? 'secundario' : 'primario'}>
                            Declarar la cuenta bancaria
                        </ButtonLink>
                    )}
                </div>
            </section>
        );
    }

    // El aviso importa mientras Mercado Pago sea una forma posible de cobrar:
    // disponible, o a un vínculo de distancia. Si la pasarela o la cotización
    // no están, el comprador solo puede transferir y no hay nada que avisar.
    const showFeeNotice = options?.mercadopago.available === true || needsLink;

    return (
        <section
            aria-labelledby="esperando-pago"
            className="flex flex-col gap-3 rounded-[var(--radius-chico)] border border-[var(--color-borde)] p-4"
        >
            <h3 id="esperando-pago" className="text-[15px] font-medium">
                Esperando el pago del comprador
            </h3>
            <p className={ESTILO_TEXTO}>No tenés nada que hacer por ahora.</p>
            {/*
              * Sin porcentajes ni plazos: dependen del medio con que pague el
              * comprador y cambian. Lo que el vendedor necesita saber es que
              * cobra distinto según cómo pague el comprador.
              */}
            {showFeeNotice && (
                <p className={ESTILO_TEXTO}>
                    Si el comprador paga con Mercado Pago, Mercado Pago descuenta su comisión de tu
                    cobro y acredita el dinero en sus plazos. Si paga por transferencia cobrás el
                    monto acordado, sin ese descuento.
                </p>
            )}
            {needsLink && buyerCanPay && (
                <>
                    <Alert tono="alerta">
                        Todavía no vinculaste tu cuenta de Mercado Pago, así que el comprador solo
                        puede pagar por transferencia.
                    </Alert>
                    <ButtonLink href="/perfil#mercadopago" className="self-start">
                        Vincular Mercado Pago
                    </ButtonLink>
                </>
            )}
            {needsBank && buyerCanPay && (
                <>
                    <Alert tono="alerta">
                        Todavía no declaraste tu cuenta bancaria, así que el comprador solo puede
                        pagar con Mercado Pago.
                    </Alert>
                    <ButtonLink href="/perfil#cuenta-bancaria" className="self-start">
                        Declarar la cuenta bancaria
                    </ButtonLink>
                </>
            )}
        </section>
    );
}
