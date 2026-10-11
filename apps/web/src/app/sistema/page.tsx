import { Reveal } from '@/components/Reveal';
import { DemoBanner } from '@/components/DemoBanner';
import { Timeline } from '@/components/Timeline';
import { LockIcon } from '@/components/LockIcon';
import { NotificationDropdown } from '@/components/NotificationDropdown';
import { TransferStatus, TransferableBadge } from '@/components/Transferability';
import { CustodyAccountForm } from '@/components/CustodyAccountForm';
import { PlatformAccessForm } from '@/components/PlatformAccessForm';
import { RecipientIdentityForm, RecipientIdentitySaved } from '@/components/RecipientIdentityForm';
import { TransferInitiationForm } from '@/components/TransferInitiationForm';
import { DeliveryVerificationForm } from '@/components/DeliveryVerificationForm';
import { MercadoPagoPanel } from '@/components/MercadoPagoPanel';
import { UnlinkMercadoPagoButton } from '@/components/UnlinkMercadoPagoButton';
import { ActionFailure } from '@/components/OperationAction';
import { VerifiedChannelCard } from '@/components/VerifiedChannelCard';
import { VerificationSeal } from '@/components/VerificationSeal';
import { YouTubeConnectStep } from '@/components/YouTubeConnectStep';
import { YouTubeListingForm } from '@/components/YouTubeListingForm';
import { AssetTypeCard, WebLogo, YouTubeLogo } from '@/components/AssetTypeCard';
import { SellSteps } from '@/components/SellSteps';
import { PriceSectionDemo } from './PriceSectionDemo';
import { InstructionsModal } from '@/components/InstructionsModal';
import { AccessPanel } from '@/components/AccessPanel';
import { DraftPanel } from '@/components/DraftPanel';
import { SellMoreAside } from '@/components/SellMoreAside';
import { EditListingDialog } from '@/components/EditListingDialog';
import { DiscardDraftButton } from '@/components/DiscardDraftButton';
import { SellerLevelGauge } from '@/components/SellerLevelGauge';
import { VerificationCards } from '@/components/VerificationCards';
import { WhyPopover } from '@/components/WhyPopover';
import { ImmediateBadge, ShimmerBolt } from '@/components/ShimmerBolt';
import { CheckLine } from '@/components/ui';
import { ChannelAvatar } from '@/components/ChannelAvatar';
import { noop, noopEstimate, noopVoid } from './actions';
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
import type {
    HandoverStepDto,
    OperationStatusDto,
    PaymentOptionsDto,
    YouTubeConnectionDto,
} from '@marketplace/api-contract';
import type { ConnectionReason } from '@/lib/youtubeConnection';

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

/** Un canal conectado de muestra, con la forma que devuelve la API. */
/** Pasos de muestra para el modal: los mismos que escribe el dominio para un canal. */
/** Los dos pasos de antes de la venta de un canal, con detalle para el diálogo. */
const PASOS_DE_ACCESO: HandoverStepDto[] = [
    {
        id: '1',
        phase: 'listing',
        description: 'El vendedor convierte el canal a Cuenta de Marca',
        title: 'Pasá tu canal a una cuenta de marca',
        details: ['Mover canal a una cuenta de marca.'],
        links: [{ label: 'Transferir el canal', href: 'https://www.youtube.com/account_advanced' }],
    },
    {
        id: '2',
        phase: 'listing',
        description: 'El vendedor invita a la plataforma como administrador',
        title: 'Invitanos como administrador',
        details: ['Invitar con el rol Administrador.'],
        links: [{ label: 'Administrar permisos', href: 'https://myaccount.google.com/brandaccounts' }],
    },
];

const AHORA_DE_MUESTRA = '2026-10-13T12:00:00.000Z';

const PASOS_DE_MUESTRA: HandoverStepDto[] = [
    {
        id: '1',
        description: 'El vendedor convierte el canal a Cuenta de Marca si todavía no lo es',
        title: 'Convertí el canal a Cuenta de Marca',
        instruction: 'Convertí el canal a Cuenta de Marca si todavía no lo es: este paso va antes de invitar a la plataforma.',
        details: [
            'Creá la cuenta de marca con "Crear un canal nuevo". Puede llamarse distinto: el canal conserva su nombre.',
            'Después, en Configuración avanzada, elegí "Transferir canal".',
            'YouTube avisa que borra el canal vacío que se creó junto con la cuenta ("Reemplazar"): es lo esperado.',
        ],
        links: [
            { label: 'Crear la cuenta de marca', href: 'https://www.youtube.com/channel_switcher' },
            { label: 'Transferir el canal', href: 'https://www.youtube.com/account_advanced' },
        ],
    },
    {
        id: '2',
        description: 'El vendedor sale de los permisos de canal en YouTube Studio',
        title: 'Salí de los permisos de canal',
        instruction: 'Quitá tu propio acceso de nivel de canal en YouTube Studio: solo tiene que quedar el de la Cuenta de Marca.',
        details: [
            'Entrá a YouTube Studio → Configuración → Permisos.',
            'Quitá tu acceso de nivel de canal.',
        ],
        links: [{ label: 'Abrir YouTube Studio', href: 'https://studio.youtube.com' }],
    },
    {
        id: '3',
        description: 'El vendedor promueve a la plataforma a propietario principal',
        title: 'Promovenos a propietario principal',
        instruction: 'Con el contrato ya firmado, promovenos a propietario principal desde la Cuenta de Marca.',
        details: [
            'Recién en este momento cedés el control, con el precio acordado.',
            'Google rechaza la promoción con un aviso breve hasta que pasen los 7 días.',
        ],
        links: [{ label: 'Promover a propietario principal', href: 'https://myaccount.google.com/brandaccounts' }],
        afterPlatformStarts: true,
    },
];

const CANAL_CON_DATOS: YouTubeConnectionDto = {
    connectionId: 'muestra-1',
    channelId: 'UCmuestra',
    channelTitle: 'Nivel Completo',
    subscribers: 12_400,
    views12Months: 1_250_000,
    revenue12MonthsCents: 345_600,
    monthlyRevenueCents: 28_800,
    isMonetized: true,
    topCountry: 'AR',
    periodStart: '2025-10-01T00:00:00.000Z',
    periodEnd: '2026-09-30T00:00:00.000Z',
    readAt: AYER,
};
const CANAL_EN_CERO: YouTubeConnectionDto = {
    ...CANAL_CON_DATOS,
    connectionId: 'muestra-2',
    channelId: 'UCcero',
    channelTitle: 'Canal nuevo',
    subscribers: 0,
    views12Months: 0,
    revenue12MonthsCents: 0,
    monthlyRevenueCents: 0,
    isMonetized: false,
    topCountry: undefined,
};
const MOTIVOS_DE_CONEXION: { reason: ConnectionReason; titulo: string; detail?: string }[] = [
    { reason: 'cancelada', titulo: 'CANCELÓ EN GOOGLE' },
    {
        reason: 'permisos',
        titulo: 'FALTAN PERMISOS',
        detail:
            'Para publicar tu canal necesitamos que nos dejes las estadísticas de ingresos. Volvé a conectar y dejá todos los permisos tildados: solo leemos, no podemos publicar ni borrar nada.',
    },
    { reason: 'sin-canal', titulo: 'LA CUENTA NO TIENE UN CANAL' },
    { reason: 'no-disponible', titulo: 'GOOGLE NO RESPONDIÓ' },
    { reason: 'invalida', titulo: 'LA CONEXIÓN NO SE PUDO VALIDAR' },
];

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
                                            instruction: 'Con el contrato ya firmado, promovenos a propietario principal desde la Cuenta de Marca.',
                                            details: PASOS_DE_MUESTRA[2].details,
                                            links: PASOS_DE_MUESTRA[2].links,
                                            afterPlatformStarts: true,
                                        },
                                    ]}
                                />
                            </Panel>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">TAREA PENDIENTE DEL COMPRADOR — CANAL (URGENTE)</div>
                            <RecipientIdentityForm action={noop} urgente assetType="youtube" />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">TAREA PENDIENTE DEL COMPRADOR — DOMINIO</div>
                            <RecipientIdentityForm action={noop} urgente={false} assetType="web" />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">CUENTA RECEPTORA YA DECLARADA</div>
                            <RecipientIdentitySaved identifier="tunombre@gmail.com" assetType="youtube" />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">CORRECCIÓN DE LA CUENTA RECEPTORA</div>
                            <RecipientIdentityForm action={noop} urgente={false} assetType="web" valorActual="mi-usuario" />
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
                    title="Elegir qué vender"
                    note="La entrada de /vender: una tarjeta por tipo de activo, con el logo, qué se hace y la llamada abajo. La de YouTube envía una acción (abre Google) cuando no hay canales conectados; con canales, o en la de sitio web, es un enlace. Arriba del recorrido, los pasos de cada tipo con el actual resaltado."
                >
                    <div className="grid gap-8 lg:grid-cols-2">
                        <AssetTypeCard
                            logo={<YouTubeLogo />}
                            title="Canal de YouTube"
                            description="Conectás tu canal y traemos los números directo de YouTube. No tipeás nada."
                            cta="Conectar YouTube →"
                            action={noopVoid}
                        />
                        <AssetTypeCard
                            logo={<WebLogo />}
                            title="Sitio web"
                            description="Cargás los datos del sitio y comprobás que es tuyo con AdSense."
                            cta="Cargar sitio →"
                            href="/sistema"
                        />
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">PASOS — CANAL DE YOUTUBE, COMPLETANDO</div>
                            <SellSteps labels={['1 · CONECTAR', '2 · COMPLETAR', '3 · PRECIO']} current={1} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">PASOS — SITIO WEB, DATOS</div>
                            <SellSteps labels={['1 · DATOS', '2 · PRECIO', '3 · COMPROBAR']} current={0} />
                        </div>
                    </div>
                </Section>

                <Section
                    title="Precio con referencia"
                    note="El precio va primero, con la moneda y un monto grande; la valuación queda al costado como referencia y dice cuánto se aparta el precio. Si el vendedor elige una moneda distinta a la de la valuación no se compara: la web no tiene cotización para convertir y no inventa una."
                >
                    <div className="grid gap-8">
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">PRECIO POR ENCIMA DE LA VALUACIÓN</div>
                            <PriceSectionDemo initialCurrency="USD" initialPrice="13000" estimated={{ cents: 1_000_000, currency: 'USD' }} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">SIN PRECIO NI VALUACIÓN</div>
                            <PriceSectionDemo initialCurrency="USD" initialPrice="" estimated={null} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">EN PESOS — LA VALUACIÓN SE MUESTRA EN USD</div>
                            <PriceSectionDemo initialCurrency="ARS" initialPrice="13000000" estimated={{ cents: 1_000_000, currency: 'USD' }} />
                        </div>
                    </div>
                </Section>

                <Section
                    title="Publicar un canal conectado"
                    note="El vendedor autoriza YouTube y los números los lee Google: no se tipean. La tarjeta es de solo lectura, con el sello de verificación y la fecha de la lectura; todo número lleva su unidad y su período, y un cero se muestra como cero. Debajo, el vendedor completa solo lo que Google no sabe. Las acciones son de muestra: no salen a Google ni crean nada."
                >
                    <div className="grid gap-8 lg:grid-cols-2">
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">SELLO DE VERIFICACIÓN</div>
                            <VerificationSeal source="YouTube" at={AYER} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">PRIMER PASO — CONECTAR</div>
                            <Panel title="CONECTÁ TU CANAL">
                                <YouTubeConnectStep startAction={noopVoid} />
                            </Panel>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">TARJETA DEL CANAL — CON DATOS</div>
                            <VerifiedChannelCard channel={CANAL_CON_DATOS} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">TARJETA DEL CANAL — EN CERO, SIN FOTO NI PAÍS</div>
                            <VerifiedChannelCard channel={CANAL_EN_CERO} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">CON UN CANAL YA CONECTADO — OFRECE SUMAR OTRO</div>
                            <Panel title="ELEGÍ UN CANAL">
                                <YouTubeConnectStep startAction={noopVoid} hasConnections />
                            </Panel>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">LO QUE FALTA — RUBRO, ROSTRO Y PRECIO CON REFERENCIA</div>
                            <Panel>
                                <YouTubeListingForm
                                    action={noop}
                                    estimate={noopEstimate}
                                    verifiedData={{ subscribers: CANAL_CON_DATOS.subscribers }}
                                />
                            </Panel>
                        </div>
                        {MOTIVOS_DE_CONEXION.map(({ reason, titulo, detail }) => (
                            <div key={reason} className="flex flex-col gap-3">
                                <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">ERROR AL CONECTAR — {titulo}</div>
                                <Panel title="CONECTÁ TU CANAL">
                                    <YouTubeConnectStep startAction={noopVoid} failure={{ reason, detail }} />
                                </Panel>
                            </div>
                        ))}
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">ESE CANAL YA ESTÁ PUBLICADO</div>
                            <ActionFailure
                                error="Ese canal ya lo publicaste."
                                next={{ href: '/activos', label: 'Ver el activo' }}
                            />
                        </div>
                    </div>
                </Section>

                <Section
                    title="Instrucciones paso a paso"
                    note="Un modal con carrusel para lo que antes era una pared de texto: un paso por pantalla, con título, viñetas cortas y botones con enlaces directos a Google o YouTube, que abren en una pestaña nueva. Es un elemento nativo dialog: atrapa el foco, cierra con Esc o con el botón y devuelve el foco al botón que lo abrió. El contenido sale del dominio. La foto del canal se pide sin referrer y, si no carga, se cae a la inicial."
                >
                    <div className="grid gap-8 lg:grid-cols-2">
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">BOTÓN Y MODAL — TRES PASOS</div>
                            <Panel title="ACCESO DE LA PLATAFORMA">
                                <InstructionsModal steps={PASOS_DE_MUESTRA} />
                            </Panel>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">FOTO DEL CANAL — REDONDA EN LA FICHA, CUADRADA EN EL LISTADO, CON CAÍDA A LA INICIAL</div>
                            <div className="flex items-center gap-4">
                                <ChannelAvatar src="data:image/png;base64,AAAA" name="Nivel Completo" />
                                <ChannelAvatar name="Canal nuevo" />
                                <ChannelAvatar src="data:image/png;base64,AAAA" name="Nivel Completo" shape="square" />
                                <ChannelAvatar name="Canal nuevo" shape="square" />
                            </div>
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
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">VENDEDOR — ESPERANDO EL PAGO, CON AVISO DE LA COMISIÓN DE MERCADO PAGO</div>
                            <SellerPaymentWait options={PAGO_AMBAS} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">VENDEDOR — ESPERANDO EL PAGO, SIN MERCADO PAGO DISPONIBLE (SIN AVISO DE COMISIÓN)</div>
                            <SellerPaymentWait
                                options={{
                                    ...PAGO_AMBAS,
                                    mercadopago: { ...PAGO_AMBAS.mercadopago, available: false, reason: 'not_configured' },
                                }}
                            />
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
                <Section
                    title="Borrador: publicar, editar y borrar"
                    note="La tarjeta principal de un borrador tiene tres caras: con la titularidad comprobada se publica en el momento; sin comprobar, comprobar con Google es lo principal y la revisión a mano queda como alternativa más lenta; rechazado, solo se puede volver a mandar a revisión. Es la única tarjeta con el acento. Lo hecho se dice con una línea y un tilde chico, nunca con una caja. Borrar pide una segunda confirmación en la propia pantalla, sin cuadros del navegador."
                >
                    <div className="grid gap-8 lg:grid-cols-2">
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">LISTO PARA PUBLICAR</div>
                            <DraftPanel variant="ready" subject="canal" sourceLabel="YouTube" price="US$ 1.500" kycVerified publishAction={noop} reviewAction={noop} verifyAction={noopVoid} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">SIN TITULARIDAD COMPROBADA</div>
                            <DraftPanel variant="unverified" subject="sitio" sourceLabel="AdSense" price="US$ 1.500" kycVerified={false} publishAction={noop} reviewAction={noop} verifyAction={noopVoid} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">RECHAZADO</div>
                            <DraftPanel variant="rejected" subject="canal" sourceLabel="YouTube" price="US$ 1.500" kycVerified rejectionReason="El canal no tiene contenido propio." publishAction={noop} reviewAction={noop} verifyAction={noopVoid} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">VENDÉ MÁS RÁPIDO — SIN NIVELES NI PUNTOS</div>
                            <SellMoreAside accessHref="#" showAccess showMercadoPago />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">EDITAR (DIÁLOGO) Y BORRAR (DOS PASOS)</div>
                            <div className="flex flex-wrap items-start gap-2">
                                <EditListingDialog action={noop} scope="listing" niche="gaming" showNoFace priceCents={150000} currency="USD" />
                                <EditListingDialog action={noop} scope="price" priceCents={150000} currency="USD" />
                                <DiscardDraftButton action={noop} />
                            </div>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">RAYO Y ETIQUETA CON EL MISMO BRILLO · LÍNEA DE LO HECHO</div>
                            <div className="flex items-center gap-4">
                                <ShimmerBolt size={32} />
                                <ImmediateBadge />
                            </div>
                            <ul><CheckLine>Titularidad comprobada</CheckLine></ul>
                        </div>
                    </div>
                </Section>

                <Section
                    title="Acceso de la plataforma, en el orden en que se hace"
                    note="Solo los dos pasos de antes de la venta, que se destraban de a uno: el primero lo tilda el vendedor en su navegador; el segundo avisa a la plataforma. Después el panel cuenta en qué va: verificando, cuenta regresiva de siete días o transferencia inmediata. «Ver cómo» abre un diálogo nativo con una maqueta animada de Google (se quieta con prefers-reduced-motion) y el texto «¿Por qué te pedimos esto?». Los pasos de la operación no aparecen acá."
                >
                    <div className="grid gap-8 lg:grid-cols-2">
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">PASOS — AÚN SIN AVISAR</div>
                            <AccessPanel listingId="muestra" steps={PASOS_DE_ACCESO} email="custodia-yt-01@forzalabs.online" status="pending" guided now={AHORA_DE_MUESTRA} requestAction={noop} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">VERIFICANDO</div>
                            <AccessPanel listingId="muestra-2" steps={PASOS_DE_ACCESO} email="custodia-yt-01@forzalabs.online" status="verifying" guided now={AHORA_DE_MUESTRA} requestAction={noop} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">CONFIRMADO — CUENTA REGRESIVA</div>
                            <AccessPanel listingId="muestra-3" steps={PASOS_DE_ACCESO} email="custodia-yt-01@forzalabs.online" status="waiting" transferableFrom="2026-10-17T12:00:00.000Z" guided now={AHORA_DE_MUESTRA} requestAction={noop} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">TRANSFERENCIA INMEDIATA</div>
                            <AccessPanel listingId="muestra-4" steps={PASOS_DE_ACCESO} email="custodia-yt-01@forzalabs.online" status="immediate" guided now={AHORA_DE_MUESTRA} requestAction={noop} />
                        </div>
                        <div className="relative flex flex-col gap-3 pb-56">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">«¿POR QUÉ TE PEDIMOS ESTO?» — PASO 1 Y PASO 2</div>
                            <div className="relative h-52"><WhyPopover step={0} /></div>
                        </div>
                        <div className="relative flex flex-col gap-3 pb-56">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">PASO 2</div>
                            <div className="relative h-52"><WhyPopover step={1} /></div>
                        </div>
                    </div>
                </Section>

                <Section
                    title="Nivel de vendedor"
                    note="Titularidad suma 1, acceso de administración suma 2 y Mercado Pago suma 1, sobre 4. La identidad verificada es requisito para publicar y no suma. Lo que falta va en tarjetas con su botón; lo que ya está, en una línea con un tilde."
                >
                    <div className="flex flex-col gap-8">
                        <div className="flex flex-wrap gap-4">
                            {[0, 1, 3, 4].map((n) => (
                                <div key={n} className="w-[220px]"><SellerLevelGauge level={n} /></div>
                            ))}
                        </div>
                        <VerificationCards
                            ownership={{ done: true, sourceLabel: 'YouTube', verifiedAt: AHORA_DE_MUESTRA }}
                            access={{ done: false }}
                            mercadoPago={{ done: false }}
                            ownershipSource="YouTube"
                            kycVerified
                            verifyAction={noopVoid}
                            accessHref="#"
                        />
                    </div>
                </Section>
            </div>
        </div>
    );
}
