import type { MoneyDto, PaymentOptionsDto } from '@marketplace/api-contract';
import { exactMoney, money } from '@/lib/format';
import { Alert, Button, ButtonLink } from './ui';
import { SubmitButton } from './SubmitButton';

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
}: {
    /** `undefined` cuando no se pudieron consultar: se cae a lo que había antes. */
    options?: PaymentOptionsDto;
    /** Lo que paga el comprador, para el botón de respaldo cuando no hay `options`. */
    buyerPays?: MoneyDto;
    checkoutAction: () => Promise<void>;
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

    return (
        <section aria-labelledby="elegir-pago" className="flex flex-col gap-4">
            <h3 id="elegir-pago" className="text-[17px] font-medium">
                Elegí cómo pagar
            </h3>
            <MercadoPagoOption options={options} checkoutAction={checkoutAction} />
            <TransferOption options={options} />
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

function TransferOption({ options }: { options: PaymentOptionsDto }) {
    const { transfer } = options;

    return (
        <div className={ESTILO_OPCION}>
            <span className="text-[15px] font-medium">Transferencia bancaria</span>
            {transfer.available ? (
                <>
                    <p className={ESTILO_TEXTO}>
                        Transferí exactamente{' '}
                        <span className="font-mono text-[var(--color-tinta)]">
                            {exactMoney(options.amount)}
                        </span>{' '}
                        a esta cuenta:
                    </p>
                    {/* Texto, nunca HTML: lo carga la plataforma, pero se escapa igual. */}
                    <p className="whitespace-pre-line rounded-[var(--radius-chico)] border border-[var(--color-borde)] bg-[var(--color-fondo)] p-3 font-mono text-[13px] leading-relaxed">
                        {transfer.instructions}
                    </p>
                    <p className={ESTILO_TEXTO}>
                        Indicá esta referencia:{' '}
                        <span className="font-mono text-[var(--color-tinta)]">{transfer.reference}</span>
                    </p>
                    <p className={ESTILO_TEXTO}>
                        Cuando recibamos la transferencia la registramos y te avisamos.
                    </p>
                </>
            ) : (
                <p className={ESTILO_TEXTO}>
                    La transferencia no está disponible por ahora. Si la necesitás, abrí un reclamo
                    más abajo y te ayudamos.
                </p>
            )}
        </div>
    );
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

    return (
        <section
            aria-labelledby="esperando-pago"
            className="flex flex-col gap-3 rounded-[var(--radius-chico)] border border-[var(--color-borde)] p-4"
        >
            <h3 id="esperando-pago" className="text-[15px] font-medium">
                Esperando el pago del comprador
            </h3>
            <p className={ESTILO_TEXTO}>No tenés nada que hacer por ahora.</p>
            {needsLink && (
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
        </section>
    );
}
