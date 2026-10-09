import { Reveal } from '@/components/Reveal';
import { DemoBanner } from '@/components/DemoBanner';
import { Timeline } from '@/components/Timeline';
import { LockIcon } from '@/components/LockIcon';
import { NotificationDropdown } from '@/components/NotificationDropdown';
import { TransferStatus, TransferableBadge } from '@/components/Transferability';
import { CustodyAccountForm } from '@/components/CustodyAccountForm';
import { PlatformAccessForm } from '@/components/PlatformAccessForm';
import { RecipientIdentityForm } from '@/components/RecipientIdentityForm';
import { TransferInitiationForm } from '@/components/TransferInitiationForm';
import { DeliveryVerificationForm } from '@/components/DeliveryVerificationForm';
import { MercadoPagoPanel } from '@/components/MercadoPagoPanel';
import { UnlinkMercadoPagoButton } from '@/components/UnlinkMercadoPagoButton';
import { ActionFailure } from '@/components/OperationAction';
import { noop, noopVoid } from './actions';
import {
    Alert,
    Button,
    ButtonLink,
    Field,
    OperationStatusBadge,
    Panel,
    Heading,
    EmptyState,
} from '@/components/ui';
import { PaymentChoice, SellerPaymentWait } from '@/components/PaymentChoice';
import type { OperationStatusDto, PaymentOptionsDto } from '@marketplace/api-contract';

/**
 * Sistema de diseño.
 *
 * Reemplaza a Storybook a propósito: esto ES la aplicación, así que renderiza
 * Server Components reales con los tokens reales. Storybook solo soporta RSC
 * de forma experimental y no soporta Server Actions, que es justo lo que usa
 * esta app. Acá, si un token cambia, se ve el cambio en todo el catálogo.
 */

const TOKENS_COLOR = [
    ['--color-fondo', 'Fondo de la app'],
    ['--color-superficie', 'Tarjetas y paneles'],
    ['--color-borde', 'Bordes por defecto'],
    ['--color-borde-fuerte', 'Bordes de controles'],
    ['--color-tinta', 'Texto principal'],
    ['--color-tenue', 'Texto secundario'],
    ['--color-apagado', 'Etiquetas y metadatos'],
    ['--color-acento', 'Acción y estado favorable'],
    ['--color-alerta', 'NDA y estados de espera'],
    ['--color-error', 'Errores'],
] as const;

const ESTADOS: OperationStatusDto[] = [
    'offer_sent', 'negotiating', 'contract_pending', 'contract_signed',
    'transfer_in_progress', 'asset_in_custody', 'payment_received', 'completed', 'cancelled',
];

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
    return (
        <section className="border-b border-[var(--color-borde)] py-12">
            <div className="mb-6 flex flex-col gap-1.5">
                <h2 className="text-[21px] font-bold tracking-[-0.02em]">{title}</h2>
                {note && <p className="max-w-[620px] text-[14px] leading-relaxed text-[var(--color-tenue)]">{note}</p>}
            </div>
            {children}
        </section>
    );
}

// Fechas de muestra. El componente formatea, así que necesita fechas reales
// para que el catálogo se vea como lo que van a ver los usuarios.
const DIA = 24 * 60 * 60 * 1000;
const CUENTA_VINCULADA = {
    linked: true as const,
    mpUserId: '123456789',
    linkedAt: new Date(Date.now() - 3 * DIA).toISOString(),
    expiresAt: new Date(Date.now() + 120 * DIA).toISOString(),
    expired: false,
};
const AYER = new Date(Date.now() - DIA).toISOString();
const EN_CINCO_DIAS = new Date(Date.now() + 5 * DIA).toISOString();

/** Opciones de pago de muestra, con la forma que devuelve la API. */
const PAGO_AMBAS: PaymentOptionsDto = {
    currency: 'ARS',
    amount: { cents: 157_500_000, currency: 'ARS' },
    mercadopago: { available: true, chargedIn: 'ARS', converted: false },
    transfer: {
        available: true,
        instructions: 'Banco de ejemplo\nTitular: Plataforma de ejemplo\nCBU: 0000000000000000000000\nAlias: ejemplo.plataforma',
        reference: '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b',
    },
};
const PAGO_EN_DOLARES: PaymentOptionsDto = {
    ...PAGO_AMBAS,
    currency: 'USD',
    amount: { cents: 15_750_00, currency: 'USD' },
    mercadopago: { available: true, chargedIn: 'ARS', converted: true },
};

/** Avisos de muestra, ya redactados como los redacta el servidor. */
const AVISOS_DE_MUESTRA = [
    {
        id: '1',
        title: 'Te contraofertaron',
        body: 'La propuesta sobre la mesa ahora es USD 13.500. Te toca responder.',
        href: '/operaciones',
        when: 'hace 12 min',
        read: false,
    },
    {
        id: '2',
        title: 'El activo está en custodia',
        body: 'Verificamos el activo. Te toca transferir USD 15.750.',
        href: '/operaciones',
        when: 'hace 3 h',
        read: false,
    },
    {
        id: '3',
        title: 'Tu activo se publicó',
        body: 'Pasó la revisión y ya está visible en el mercado.',
        href: '/listings',
        when: 'ayer',
        read: true,
    },
];

export default function Sistema() {
    return (
        <div className="mx-auto max-w-[1100px] px-6 py-16 sm:px-12">
            <Reveal>
                <Heading sub="Cada componente en cada estado, con los tokens reales de la aplicación. Si cambia la identidad de marca, se cambia el bloque @theme de globals.css y todo esto se actualiza solo.">
                    Sistema de diseño
                </Heading>
            </Reveal>

            <div className="mt-10">
                <Section
                    title="Color"
                    note="El único color saturado además del acento es el ámbar, y está reservado a un significado: dato bajo NDA. El color señala el diferencial del producto en vez de decorar."
                >
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        {TOKENS_COLOR.map(([token, uso]) => (
                            <div key={token} className="flex flex-col gap-2">
                                <div
                                    className="h-14 rounded-[var(--radius-chico)] border border-[var(--color-borde)]"
                                    style={{ background: `var(${token})` }}
                                />
                                <code className="font-mono text-[10px] text-[var(--color-tenue)]">{token}</code>
                                <span className="text-[11px] text-[var(--color-apagado)]">{uso}</span>
                            </div>
                        ))}
                    </div>
                </Section>

                <Section title="Tipografía" note="Space Grotesk para texto; JetBrains Mono para números, códigos y etiquetas de estado. Los números siempre en mono: alinean en columna y se comparan de un vistazo.">
                    <div className="flex flex-col gap-4">
                        <div className="text-[55px] font-bold leading-[1.05] tracking-[-0.035em]">Titular 55 / 700</div>
                        <div className="text-[34px] font-bold tracking-[-0.03em]">Sección 34 / 700</div>
                        <div className="text-[17px] font-medium">Subtítulo 17 / 500</div>
                        <div className="text-[15px] text-[var(--color-tenue)]">Cuerpo 15 / 400 en text tenue</div>
                        <div className="font-mono text-[13px]">USD 15.000 · 55.000 subs · 12,5×</div>
                        <div className="font-mono text-[11px] tracking-[0.1em] text-[var(--color-apagado)]">
                            ETIQUETA MONO 11 / TRACKING 0.1EM
                        </div>
                    </div>
                </Section>

                <Section
                    title="Aviso de entorno de demostración"
                    note="Barra permanente y no descartable, montada arriba de todo en el layout raíz. Aparece con o sin sesión. Usa gris de segundo plano a propósito: el ámbar está reservado a los datos bajo NDA, así que este aviso informa sin competir con esa señal."
                >
                    <DemoBanner />
                </Section>

                <Section title="Acciones">
                    <div className="flex flex-wrap items-center gap-3">
                        <Button variant="primario">Primario</Button>
                        <Button variant="secundario">Secundario</Button>
                        <Button variant="fantasma">Fantasma</Button>
                        <Button variant="peligro">Cancelar operación</Button>
                        <Button variant="primario" disabled>Deshabilitado</Button>
                        <ButtonLink href="/listings" variant="secundario">Enlace con forma de botón</ButtonLink>
                    </div>
                </Section>

                <Section title="Estados de la operación" note="Cada estado del dominio tiene una etiqueta y un color propios. En custodia y completada usan el acento porque son los dos momentos en que el riesgo baja.">
                    <div className="flex flex-wrap gap-2.5">
                        {ESTADOS.map((e) => (
                            <OperationStatusBadge key={e} state={e} />
                        ))}
                    </div>
                </Section>

                <Section title="Confidencialidad">
                    <div className="flex flex-wrap items-center gap-4">
                        <span className="flex items-center gap-1.5 rounded-[var(--radius-chico)] border border-[var(--color-alerta)]/40 px-2.5 py-1">
                            <LockIcon />
                            <span className="font-mono text-[10px] text-[var(--color-alerta)]">NDA</span>
                        </span>
                        <span className="text-[14px] text-[var(--color-tenue)]">
                            Marca un activo cuyos datos sensibles están ocultos hasta firmar.
                        </span>
                    </div>
                </Section>

                <Section title="Formularios">
                    <div className="grid max-w-[520px] gap-4">
                        <Field label="Email" type="email" placeholder="vos@ejemplo.com" />
                        <Field label="Contraseña" type="password" hint="Mínimo 8 caracteres, con al menos una letra y un número." />
                    </div>
                </Section>

                <Section title="Superficies y mensajes">
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Panel title="PANEL CON TÍTULO">
                            <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                Contenedor por defecto de cualquier bloque de contenido.
                            </p>
                        </Panel>
                        <div className="flex flex-col gap-4">
                            <Alert>Email o contraseña incorrectos.</Alert>
                            <Alert tono="alerta">Necesitás verifyIdentityAction tu identidad para firmar.</Alert>
                        </div>
                    </div>
                    <div className="mt-4">
                        <EmptyState
                            title="Todavía no hay ofertas"
                            text="Cuando alguien oferte por este activo vas a verlo acá, con el monto y a quién le toca responder."
                            action={<ButtonLink href="/listings" variant="secundario">Ver el mercado</ButtonLink>}
                        />
                    </div>
                </Section>

                <Section
                    title="Transferibilidad del activo"
                    note="Los tres estados posibles de un activo respecto de la custodia. Ninguno afirma nada que la plataforma no pueda respaldar: la API de YouTube no expone quiénes son los propietarios de un canal, así que un “listo para transferir” permanente estaría mintiendo. Por eso el estado intermedio muestra una fecha calculada y no una promesa, y el tercero admite abiertamente que el acceso no está cedido."
                >
                    <div className="grid gap-6 lg:grid-cols-3">
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">TRANSFERIBLE HOY</div>
                            <TransferStatus transferable transferableFrom={AYER} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">EN PERÍODO DE ESPERA</div>
                            {/* El motivo de la espera lo escribe el tipo de activo:
                                acá se pasa uno de ejemplo porque el catálogo no
                                está a mano en la página del sistema. */}
                            <TransferStatus
                                transferable={false}
                                transferableFrom={EN_CINCO_DIAS}
                                waitingNotice="YouTube exige haber sido propietario del canal durante siete días antes de permitir el cambio de propietario principal."
                            />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">SIN ACCESO CEDIDO</div>
                            <TransferStatus
                                transferable={false}
                                waitingNotice="YouTube exige haber sido propietario del canal durante siete días antes de permitir el cambio de propietario principal."
                            />
                        </div>
                    </div>

                    <div className="mt-8 flex flex-col gap-2.5 border-t border-[var(--color-borde)] pt-6">
                        <p className="max-w-[620px] text-[14px] leading-relaxed text-[var(--color-tenue)]">
                            En la grilla el mismo estado se reduce a un sello. El tercer caso no
                            dibuja nada: la mayoría de los activos están así y un cartel de “no
                            disponible” repetido en cada tarjeta sería solo ruido.
                        </p>
                        <div className="flex flex-wrap items-center gap-6">
                            <TransferableBadge transferable transferableFrom={AYER} />
                            <TransferableBadge transferable={false} transferableFrom={EN_CINCO_DIAS} />
                            <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-borde-fuerte)]">
                                (sin sello)
                            </span>
                        </div>
                    </div>
                </Section>

                <Section
                    title="Avisos"
                    note="La campana del navbar. Abre un desplegable con las novedades recientes y un enlace a la bandeja completa: un aviso suele leerse de un vistazo —te toca responder, se firmó el contrato— y mandar a otra pantalla para leer una línea es más fricción de la que el contenido justifica. Hacé clic para verlo abierto."
                >
                    <div className="flex flex-wrap items-start gap-16">
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">CON AVISOS SIN LEER</div>
                            <NotificationDropdown items={AVISOS_DE_MUESTRA} unread={2} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">TODO LEÍDO</div>
                            <NotificationDropdown
                                items={AVISOS_DE_MUESTRA.map((a) => ({ ...a, read: true }))}
                                unread={0}
                            />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">SIN AVISOS</div>
                            <NotificationDropdown items={[]} unread={0} />
                        </div>
                    </div>
                </Section>

                <Section title="Línea de tiempo del escrow" note="El mismo componente en dos momentos distintos. La etapa de custodia está marcada como punto de control porque es donde la plataforma asume el riesgo.">
                    <div className="grid gap-10 lg:grid-cols-2">
                        <div>
                            <div className="mb-4 font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">NEGOCIANDO</div>
                            <Timeline actual="negotiating" />
                        </div>
                        <div>
                            <div className="mb-4 font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">EN CUSTODIA</div>
                            <Timeline actual="asset_in_custody" />
                        </div>
                    </div>
                </Section>

                <Section
                    title="Identidad de custodia y entrega"
                    note="La cuenta de custodia es la identidad real que sostiene un activo mientras está en el escrow. El comprador declara dónde recibirlo como tarea pendiente, y el cierre registra una constancia de entrega simétrica a la de custodia. Estas acciones son de muestra: no guardan nada."
                >
                    <div className="grid gap-8 lg:grid-cols-2">
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">ALTA DE CUENTA DE CUSTODIA</div>
                            <Panel title="DAR DE ALTA UNA CUENTA">
                                <CustodyAccountForm action={noop} />
                            </Panel>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">REGISTRAR EL ACCESO CON CUENTA</div>
                            <Panel title="ACCESO DE LA PLATAFORMA">
                                <PlatformAccessForm
                                    registerUser={noop}
                                    revocar={noop}
                                    transferable={false}
                                    handoverSteps={[
                                        { id: '1', description: 'El vendedor convierte el canal a Cuenta de Marca' },
                                        { id: '2', description: 'El vendedor sale de los permisos de canal en YouTube Studio' },
                                        { id: '3', description: 'El vendedor invita a custodia-yt-01@traspaso.com como administrador del canal' },
                                    ]}
                                    custodyAccounts={[
                                        { id: 'a', label: 'Custodia YouTube 01', identifier: 'custodia-yt-01@traspaso.com' },
                                    ]}
                                />
                            </Panel>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">DECLARACIÓN DE CESIÓN DEL VENDEDOR</div>
                            <Panel title="INICIAR LA TRANSFERENCIA">
                                <TransferInitiationForm
                                    action={noop}
                                    steps={[
                                        {
                                            id: '1',
                                            description: 'El vendedor promueve a custodia-yt-01@traspaso.com de administrador a propietario principal',
                                            instruction: 'Con el contrato ya firmado, promovenos a propietario principal desde la Cuenta de Marca. La opción aparece desde el primer día, pero Google la rechaza con un aviso breve hasta que pasen los 7 días: intentarlo antes no cambia nada. Google te va a mostrar lo que cedés: agregar y borrar propietarios y administradores, cambiar permisos y borrar la cuenta por completo.',
                                            afterPlatformStarts: true,
                                        },
                                    ]}
                                />
                            </Panel>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">TAREA PENDIENTE DEL COMPRADOR (URGENTE)</div>
                            <RecipientIdentityForm action={noop} urgente />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">CONSTANCIA DE ENTREGA</div>
                            <Panel title="CERRAR LA OPERACIÓN">
                                <DeliveryVerificationForm action={noop} recipientIdentifier="comprador@gmail.com" />
                            </Panel>
                        </div>
                    </div>
                </Section>

                <Section
                    title="Cuenta de Mercado Pago"
                    note="La tarjeta del perfil donde el vendedor vincula la cuenta en la que cobra. Una sola decisión por estado: sin vincular hay un botón; vinculada solo ofrece desvincular, con poco peso y una confirmación; si la integración no está disponible no hay botón, porque no llevaría a ningún lado. Las acciones son de muestra: no guardan nada."
                >
                    <div className="grid gap-8 lg:grid-cols-2">
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">SIN VINCULAR</div>
                            <MercadoPagoPanel status={{ linked: false }} startAction={noopVoid} unlinkAction={noop} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">VINCULADA</div>
                            <MercadoPagoPanel status={CUENTA_VINCULADA} startAction={noopVoid} unlinkAction={noop} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">RECIÉN VINCULADA</div>
                            <MercadoPagoPanel
                                status={CUENTA_VINCULADA}
                                result="vinculada"
                                startAction={noopVoid}
                                unlinkAction={noop}
                            />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">PERMISO VENCIDO</div>
                            <MercadoPagoPanel
                                status={{ ...CUENTA_VINCULADA, expired: true }}
                                startAction={noopVoid}
                                unlinkAction={noop}
                            />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">NO SE PUDO VINCULAR</div>
                            <MercadoPagoPanel
                                status={{ linked: false }}
                                result="error"
                                startAction={noopVoid}
                                unlinkAction={noop}
                            />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">NO DISPONIBLE TODAVÍA</div>
                            <MercadoPagoPanel status="unavailable" startAction={noopVoid} unlinkAction={noop} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">CONFIRMAR LA DESVINCULACIÓN</div>
                            <Panel title="MERCADO PAGO">
                                <UnlinkMercadoPagoButton action={noop} initiallyConfirming />
                            </Panel>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">ENVIAR A REVISIÓN SIN CUENTA VINCULADA</div>
                            <ActionFailure
                                error="Para publicar tenés que vincular tu cuenta de Mercado Pago: ahí recibís el cobro de tus ventas."
                                next={{ href: '/perfil#mercadopago', label: 'Vincular Mercado Pago' }}
                            />
                        </div>
                    </div>
                </Section>

                <Section
                    title="Elegir cómo pagar"
                    note="Lo que ve el comprador con el activo en custodia: una sola decisión con dos opciones, cada una con lo necesario para ejecutarla ahí mismo. Mercado Pago deshabilitado es un botón deshabilitado de verdad, con el motivo y la alternativa; si no hay ninguna opción se dice una sola vez en lugar de mostrar dos callejones. El vendedor no decide nada: espera, y solo ve un aviso con un botón cuando su cuenta de Mercado Pago no está vinculada. Las acciones son de muestra: no cobran nada."
                >
                    <div className="grid gap-8 lg:grid-cols-2">
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">COMPRADOR — LAS DOS OPCIONES</div>
                            <PaymentChoice options={PAGO_AMBAS} checkoutAction={noopVoid} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">COMPRADOR — OPERACIÓN EN DÓLARES</div>
                            <PaymentChoice options={PAGO_EN_DOLARES} checkoutAction={noopVoid} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">MERCADO PAGO — EL VENDEDOR NO LO HABILITÓ</div>
                            <PaymentChoice
                                options={{
                                    ...PAGO_AMBAS,
                                    mercadopago: { ...PAGO_AMBAS.mercadopago, available: false, reason: 'seller_not_linked' },
                                }}
                                checkoutAction={noopVoid}
                            />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">MERCADO PAGO — NO DISPONIBLE POR AHORA</div>
                            <PaymentChoice
                                options={{
                                    ...PAGO_EN_DOLARES,
                                    mercadopago: { ...PAGO_EN_DOLARES.mercadopago, available: false, reason: 'rate_unavailable' },
                                }}
                                checkoutAction={noopVoid}
                            />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">TRANSFERENCIA NO DISPONIBLE</div>
                            <PaymentChoice
                                options={{
                                    ...PAGO_AMBAS,
                                    transfer: { available: false, reference: PAGO_AMBAS.transfer.reference },
                                }}
                                checkoutAction={noopVoid}
                            />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">NINGUNA OPCIÓN DISPONIBLE</div>
                            <PaymentChoice
                                options={{
                                    ...PAGO_AMBAS,
                                    mercadopago: { ...PAGO_AMBAS.mercadopago, available: false, reason: 'not_configured' },
                                    transfer: { available: false, reference: PAGO_AMBAS.transfer.reference },
                                }}
                                checkoutAction={noopVoid}
                            />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">NO SE PUDO ABRIR EL PAGO</div>
                            <Alert tono="alerta">
                                No pudimos abrir el pago. El activo sigue en custodia, así que no perdiste nada: probá de nuevo o pagá por transferencia.
                            </Alert>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">VENDEDOR — ESPERANDO EL PAGO</div>
                            <SellerPaymentWait options={PAGO_AMBAS} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">VENDEDOR — SIN MERCADO PAGO VINCULADO</div>
                            <SellerPaymentWait
                                options={{
                                    ...PAGO_AMBAS,
                                    mercadopago: { ...PAGO_AMBAS.mercadopago, available: false, reason: 'seller_not_linked' },
                                }}
                            />
                        </div>
                    </div>
                </Section>
            </div>
        </div>
    );
}
