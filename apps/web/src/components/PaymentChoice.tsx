import type { MoneyDto, PaymentOptionsDto, PaymentReceiptDto, ReceiptRecipientDto } from '@marketplace/api-contract';
import { money } from '@/lib/format';
import { Alert, ButtonLink } from './ui';
import { SubmitButton } from './SubmitButton';
import { PaymentFlow, type ReceiptUploadAction, type ReviewActions } from './PaymentFlow';

/**
 * Cómo paga el comprador.
 *
 * Quien llega acá lo hace una vez, con el activo ya en custodia, a pagar lo que
 * acordó. Elige el medio y sigue los pasos (`PaymentFlow`); este componente
 * resuelve antes los dos casos en que no hay nada que elegir.
 *
 * Es presentacional: recibe las acciones, así `/sistema` puede mostrarlo en
 * cada estado sin tocar nada real.
 */

const ESTILO_TEXTO = 'text-[14px] leading-relaxed text-[var(--color-tenue)]';

/** Sin una acción para adjuntar no hay subida posible: se dice en vez de fallar callado. */
async function unavailableUpload(): Promise<{ error: string }> {
    'use server';
    return { error: 'No pudimos adjuntar el comprobante. Probá de nuevo.' };
}

export function PaymentChoice({
    options,
    buyerPays,
    checkoutAction,
    receipts = [],
    uploadActions,
    reviewActions,
    initialView,
}: {
    /** `undefined` cuando no se pudieron consultar: se cae a lo que había antes. */
    options?: PaymentOptionsDto;
    /** Lo que paga el comprador, para el botón de respaldo cuando no hay `options`. */
    buyerPays?: MoneyDto;
    checkoutAction: () => Promise<void>;
    /** Los comprobantes que ya adjuntó, uno por transferencia. */
    receipts?: PaymentReceiptDto[];
    /** Adjunta el comprobante de cada transferencia: una Server Action vinculada por destino. */
    uploadActions?: Record<ReceiptRecipientDto, ReceiptUploadAction>;
    /** Pedir la revisión de un comprobante rechazado y sumarle el ID COELSA. */
    reviewActions?: ReviewActions;
    initialView?: 'choose' | 'mercadopago' | 'transfer-intro';
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

    // Sin ningún medio el comprador no tiene nada que hacer: lo resuelve la plataforma.
    if (!options.mercadopago.available && !options.transfer.available) {
        return (
            <Alert tono="alerta">
                Por ahora no hay un medio de pago disponible. El activo sigue en custodia: te avisaremos cuando
                puedas pagar.
            </Alert>
        );
    }

    return (
        <PaymentFlow
            options={options}
            receipts={receipts}
            checkoutAction={checkoutAction}
            uploadActions={uploadActions ?? { platform: unavailableUpload, seller: unavailableUpload }}
            reviewActions={reviewActions}
            initialView={initialView}
        />
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
                        ? 'El comprador podrá pagar cuando vincules Mercado Pago o declares la cuenta bancaria donde recibirás la transferencia. Con una alcanza.'
                        : needsLink
                          ? 'El comprador podrá pagar cuando vincules tu cuenta de Mercado Pago.'
                          : 'El comprador podrá pagar cuando declares la cuenta bancaria donde recibirás la transferencia.'}
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
            <p className={ESTILO_TEXTO}>Te avisaremos cuando el comprador realice el pago.</p>
            {/*
              * Sin porcentajes ni plazos: dependen del medio con que pague el
              * comprador y cambian. Lo que el vendedor necesita saber es que
              * cobra distinto según cómo pague el comprador.
              */}
            {showFeeNotice && (
                <p className={ESTILO_TEXTO}>
                    Si el comprador paga con Mercado Pago, Mercado Pago descontará su comisión de tu
                    cobro y acreditará el dinero en sus plazos. Si paga por transferencia, recibirás
                    el monto acordado, sin ese descuento.
                </p>
            )}
            {needsLink && buyerCanPay && (
                <>
                    <Alert tono="alerta">
                        Todavía no vinculaste tu cuenta de Mercado Pago: el comprador solo podrá
                        pagar por transferencia.
                    </Alert>
                    <ButtonLink href="/perfil#mercadopago" className="self-start">
                        Vincular Mercado Pago
                    </ButtonLink>
                </>
            )}
            {needsBank && buyerCanPay && (
                <>
                    <Alert tono="alerta">
                        Todavía no declaraste tu cuenta bancaria: el comprador solo podrá pagar con
                        Mercado Pago.
                    </Alert>
                    <ButtonLink href="/perfil#cuenta-bancaria" className="self-start">
                        Declarar la cuenta bancaria
                    </ButtonLink>
                </>
            )}
        </section>
    );
}
