import { Reveal } from '@/components/Reveal';
import { DemoBanner } from '@/components/DemoBanner';
import { Timeline } from '@/components/Timeline';
import { NextStepCard } from '@/components/NextStep';
import { BankAccountsView } from '@/components/BankAccountSection';
import { RejectTransferForm } from '@/components/RejectTransferForm';
import { ReceiptReviewForm } from '@/components/ReceiptForms';
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
import { AssetMark, AssetTypeCard, WebLogo, WebMark, YouTubeLogo } from '@/components/AssetTypeCard';
import { SellSteps } from '@/components/SellSteps';
import { PriceSectionDemo } from './PriceSectionDemo';
import { InstructionsModal } from '@/components/InstructionsModal';
import { AccessPanel } from '@/components/AccessPanel';
import { DraftPanel } from '@/components/DraftPanel';
import { SellMoreAside } from '@/components/SellMoreAside';
import { EditListingDialog } from '@/components/EditListingDialog';
import { DiscardDraftButton } from '@/components/DiscardDraftButton';
import { AssetSummaryCard, OwnershipCheck, OwnershipProof } from '@/components/AssetSummaryCard';
import { SendToReviewLink } from '@/components/SendToReviewLink';
import { SellerLevelGauge } from '@/components/SellerLevelGauge';
import { VerificationCards } from '@/components/VerificationCards';
import { WhyPopover } from '@/components/WhyPopover';
import { DnsVerificationDialogView } from '@/components/DnsVerificationDialog';
import { DnsVerificationTrigger } from '@/components/DnsVerificationTrigger';
import { ImmediateBadge, ShimmerBolt } from '@/components/ShimmerBolt';
import { CheckLine } from '@/components/ui';
import { ChannelAvatar } from '@/components/ChannelAvatar';
import { noop, noopDnsChallenge, noopDnsCheck, noopEstimate, noopVoid } from './actions';
import { AccessInbox, InboxTabs } from '@/components/AdminInbox';
import { DraftChoice } from '@/components/DraftChoice';
import { PublishedData } from '@/components/PublishedData';
import { YOUTUBE_CARD_FIELD_KEYS } from '@/lib/publishedFields';
import { PendingBadge } from '@/components/Navbar';
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
    DomainOwnershipChallengeDto,
    HandoverStepDto,
    OperationStatusDto,
    PaymentOptionsDto,
    StepProgressDto,
    YouTubeConnectionDto,
} from '@marketplace/api-contract';
import {
    AdminDomainTransferPanel,
    DomainDeliveryStatus,
    DomainLockNotice,
    SaleRequirementsPanel,
    TransferStepsList,
} from '@/components/TransferSteps';
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
const DNS_NETLIFY: DomainOwnershipChallengeDto = {
    domain: 'ejemplo.com',
    host: '@',
    value: 'traspaso-verificacion=178cd4d4534d977fbdf74f70',
    nameservers: ['dns1.p08.nsone.net', 'dns2.p08.nsone.net'],
    provider: 'netlify',
};
const DNS_UNKNOWN: DomainOwnershipChallengeDto = { ...DNS_NETLIFY, provider: null };
const DNS_SUBDOMAIN: DomainOwnershipChallengeDto = {
    ...DNS_UNKNOWN,
    domain: 'tienda.ejemplo.com',
    host: 'tienda.ejemplo.com',
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

/** El paso de antes de la venta de un sitio: sin maqueta de Google, se lee como texto. */
const PASOS_DE_ACCESO_WEB: HandoverStepDto[] = [
    {
        id: '1',
        key: 'domain-at-hostinger',
        check: 'declared',
        phase: 'listing',
        description: 'El vendedor tiene el dominio en Hostinger, o planea mudarlo con el código EPP antes de vender',
        title: 'Tené el dominio en Hostinger',
        instruction:
            'Para venderlo, el dominio tiene que estar en una cuenta de Hostinger: si hoy está en otro registrador, pedí el código EPP y mudalo antes de recibir ofertas.',
        details: ['Si lo registraste o lo mudaste hace menos de 60 días, puede que todavía no se pueda mover.'],
    },
]

/** Un canal y un sitio esperando que verifiquemos el acceso, uno de hoy y otro de ayer. */
const ACCESOS_DE_MUESTRA = [
    { id: 'a1', assetType: 'youtube', assetName: 'Pc Lover', sellerName: 'Esteban Vendedor', hace: 2 * 60 * 60 * 1000 },
    { id: 'a2', assetType: 'web', assetName: 'Tienda de muestra', sellerName: 'Esteban Vendedor', hace: 26 * 60 * 60 * 1000 },
].map(({ id, assetType, assetName, sellerName, hace }) => ({
    id,
    assetType,
    assetName,
    sellerName,
    platformAccessRequestedAt: new Date(Date.now() - hace).toISOString(),
}));

const AHORA_DE_MUESTRA = '2026-10-13T12:00:00.000Z';

/** Los pasos de la operación de un sitio, como los entrega `WebStrategy`, y su progreso. */
const PASOS_DE_TRASPASO_WEB: HandoverStepDto[] = [
    { id: '2', key: 'domain-to-platform', check: 'automatic', description: 'd', title: 'Trasladá el dominio a nuestra cuenta' },
    { id: '3', key: 'hosting', check: 'declared', description: 'd', title: 'Dejá el hosting y los archivos listos' },
    { id: '4', key: 'code', check: 'declared', description: 'd', title: 'Dejá el código y la base de datos listos' },
    { id: '5', key: 'accounts', check: 'declared', description: 'd', title: 'Dejá listas las cuentas asociadas' },
];
const PLAZO_DE_MUESTRA = '2026-10-23T12:00:00.000Z';
const PROGRESO_DE_MUESTRA: StepProgressDto[] = [
    { stepKey: 'domain-to-platform', status: 'waiting', deadlineAt: PLAZO_DE_MUESTRA, attested: false },
    { stepKey: 'hosting', status: 'done', attested: true },
];

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
        // Cada uno recibe lo suyo: el precio menos su 5 % al vendedor, el 10 % a la plataforma.
        destinations: [
            {
                recipient: 'seller',
                amount: { cents: 142_500_000, currency: 'ARS' },
                bankAccount: { alias: 'ejemplo.vendedor', holder: 'Vendedor de ejemplo' },
            },
            {
                recipient: 'platform',
                amount: { cents: 15_000_000, currency: 'ARS' },
                instructions: 'Banco de ejemplo\nTitular: Plataforma de ejemplo\nCBU: 0000000000000000000000\nAlias: ejemplo.plataforma',
            },
        ],
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
        id: '0',
        title: 'Un vendedor ya nos invitó',
        body: 'Avisó que ya nos invitó a su canal. Falta verificar el acceso.',
        href: '/admin?bandeja=accesos',
        when: 'hace 2 min',
        read: false,
    },
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
                    note="Lo que lee el comprador, en una línea: desde cuándo se cierra y que puede ofertar hoy. Con fecha lleva el calendario; cuando ya es inmediata, el rayo del acento. No explica la custodia ni los plazos del tipo de activo, y tampoco nombra a administradores ni dueños: eso es cosa de la plataforma y del vendedor."
                >
                    <div className="grid gap-6 lg:grid-cols-3">
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">TRANSFERIBLE HOY</div>
                            <TransferStatus transferable transferableFrom={AYER} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">EN PERÍODO DE ESPERA</div>
                            <TransferStatus
                                transferable={false}
                                transferableFrom={EN_CINCO_DIAS}
                            />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">SIN ACCESO CEDIDO</div>
                            <TransferStatus
                                transferable={false}
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
                    title="Bandeja del panel de la plataforma"
                    note="Lo que espera un movimiento de la plataforma, en pestañas con contador: accesos por verificar, activos por revisar y reclamos. La pestaña abierta es la primera con pendientes, y cada pestaña es un enlace, así que se comparte. Los accesos son una tabla con las dos acciones de siempre y la marca del tipo de activo en cada fila (YouTube o sitio); la antigüedad del aviso se pinta en ámbar durante el primer día. Las acciones son de muestra."
                >
                    <div className="flex flex-col gap-8">
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">PESTAÑAS — ACCESOS ABIERTA</div>
                            <InboxTabs active="accesos" counts={{ accesos: 2, revision: 1, reclamos: 0 }} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">ACCESOS POR VERIFICAR</div>
                            <AccessInbox
                                listings={ACCESOS_DE_MUESTRA}
                                now={new Date()}
                                verifyAction={noopVoid}
                                rejectAction={noopVoid}
                            />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">CONTADOR EN EL MENÚ</div>
                            <span className="font-mono text-[12px] tracking-wider text-[var(--color-alerta)]">
                                ADMIN
                                <PendingBadge count={3} />
                            </span>
                        </div>
                    </div>
                </Section>

                <Section
                    title="Vender con un borrador"
                    note="Cuando el canal que el vendedor conectó ya tiene un borrador, dos tarjetas del mismo peso: seguir con ese o traer otro canal desde YouTube. La del borrador lleva el acento y dice lo que le falta —si no tiene precio, no promete «solo falta publicarlo»."
                >
                    <div className="flex flex-col gap-8">
                        <DraftChoice channelTitle="Lovi en Reddit" hasPrice draftHref="/sistema" connectAction={noopVoid} />
                        <DraftChoice channelTitle="Pc Lover" hasPrice={false} draftHref="/sistema" connectAction={noopVoid} />
                    </div>
                </Section>

                <Section
                    title="Verificaciones: canal y datos publicados"
                    note="La tarjeta del canal ya trae suscriptores, ingresos, audiencia y nombre, así que los datos publicados de un canal de YouTube no los repiten: muestran solo lo que falta. Ocupan todo el ancho en dos columnas, y la dirección del canal es un enlace real, abreviado a la vista."
                >
                    <div className="flex flex-col gap-6">
                        <VerifiedChannelCard channel={CANAL_CON_DATOS} />
                        <PublishedData
                            fields={[
                                { key: 'niche', label: 'Rubro', kind: 'niche' },
                                { key: 'hasNoFaceContent', label: 'Contenido sin rostro', kind: 'boolean' },
                                { key: 'isMonetized', label: 'Monetizado', kind: 'boolean' },
                                { key: 'name', label: 'Nombre del canal', kind: 'text' },
                                { key: 'channelUrl', label: 'Canal', kind: 'text' },
                            ]}
                            exclude={YOUTUBE_CARD_FIELD_KEYS}
                            data={{
                                niche: 'finance',
                                hasNoFaceContent: true,
                                isMonetized: false,
                                name: 'Pc Lover',
                                channelUrl: 'https://www.youtube.com/channel/UCkHabcdefghijklmnopUvGQ',
                            }}
                        />
                    </div>
                </Section>

                <Section
                    title="Avisos"
                    note="La campana del navbar. Abre un desplegable con las novedades recientes y un enlace a la bandeja completa: un aviso suele leerse de un vistazo —te toca responder, se firmó el contrato— y mandar a otra pantalla para leer una línea es más fricción de la que el contenido justifica. Hacé clic para verlo abierto."
                >
                    <div className="flex flex-wrap items-start gap-16">
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">CON AVISOS SIN LEER</div>
                            <NotificationDropdown items={AVISOS_DE_MUESTRA} unread={3} />
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

                <Section title="Línea de tiempo del escrow" note="La misma para las tres partes, en dos momentos distintos. Cada etapa cumplida lleva su fecha; la custodia está marcada como punto de control porque es donde la plataforma toma el activo.">
                    <div className="grid gap-10 lg:grid-cols-2">
                        <div>
                            <div className="mb-4 font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">NEGOCIANDO</div>
                            <Timeline
                                stages={[
                                    { key: 'negotiation', state: 'current' },
                                    { key: 'contract', state: 'pending' },
                                    { key: 'custody', state: 'pending' },
                                    { key: 'payment', state: 'pending' },
                                    { key: 'delivery', state: 'pending' },
                                    { key: 'closing', state: 'pending' },
                                ]}
                            />
                        </div>
                        <div>
                            <div className="mb-4 font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">EN CUSTODIA</div>
                            <Timeline
                                stages={[
                                    { key: 'negotiation', state: 'done' },
                                    { key: 'contract', state: 'done', at: '2026-10-21T12:00:00.000Z' },
                                    { key: 'custody', state: 'done', at: '2026-10-23T18:00:00.000Z' },
                                    { key: 'payment', state: 'current' },
                                    { key: 'delivery', state: 'pending' },
                                    { key: 'closing', state: 'pending' },
                                ]}
                            />
                        </div>
                    </div>
                </Section>

                <Section title="Cuenta bancaria del vendedor" note="Dónde cobra el vendedor cuando el comprador paga por transferencia: una cuenta por moneda, con un CBU o un alias. Estas acciones son de muestra: no guardan nada.">
                    <div className="max-w-[560px]">
                        <BankAccountsView
                            accounts={[{ currency: 'ARS', alias: 'delia.pesos', holder: 'Delia Orrego', declaredAt: '2026-10-22T10:00:00.000Z' }]}
                            actionFor={() => noop}
                        />
                    </div>
                </Section>

                <Section title="Tu próximo paso" note="Lo primero que lee cada parte en una operación: qué le toca, con el formulario al lado, o a quién espera y hasta cuándo. La tarea que no traba nada va aparte, como «mientras tanto».">
                    <div className="grid gap-6 lg:grid-cols-3">
                        <div>
                            <div className="mb-4 font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">LE TOCA · CON PLAZO</div>
                            <NextStepCard
                                copy={{
                                    title: 'Iniciá el traslado del dominio',
                                    body: 'Seguí los pasos para trasladar el dominio a nuestra cuenta de Hostinger y declaralo acá.',
                                    deadline: 'Tenés hasta el 31 de octubre de 2026.',
                                }}
                            >
                                <Button type="button">Ya lo hice</Button>
                            </NextStepCard>
                        </div>
                        <div>
                            <div className="mb-4 font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">ESPERA · CON TAREA</div>
                            <NextStepCard
                                copy={{
                                    title: 'Le toca al vendedor: iniciar el traslado del dominio a nuestra cuenta.',
                                    deadline: 'Tiene hasta el 31 de octubre de 2026.',
                                    meanwhile: {
                                        title: 'Decinos dónde recibir el dominio',
                                        body: 'El mail de tu cuenta de Hostinger: ahí te vamos a trasladar el dominio.',
                                    },
                                }}
                            />
                        </div>
                        <div>
                            <div className="mb-4 font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">ESPERA A LA PLATAFORMA</div>
                            <NextStepCard copy={{ title: 'Le toca a la plataforma: habilitar un medio de pago.' }} />
                        </div>
                    </div>
                </Section>

                <Section
                    title="Traspaso de un sitio"
                    note="Los pasos con su estado y su plazo, lo que ve el comprador de la entrega, los botones del admin y el aviso de los 60 días antes de ofertar."
                >
                    <div className="grid gap-10 lg:grid-cols-2">
                        <div>
                            <div className="mb-4 font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">VENDEDOR · PASOS</div>
                            <TransferStepsList steps={PASOS_DE_TRASPASO_WEB} progress={PROGRESO_DE_MUESTRA} />
                        </div>
                        <div>
                            <div className="mb-4 font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">ADMIN · TRANSFERENCIA EN CURSO</div>
                            <AdminDomainTransferPanel
                                status="transfer_in_progress"
                                steps={PASOS_DE_TRASPASO_WEB}
                                progress={PROGRESO_DE_MUESTRA}
                                actions={{ checkCustody: noop, attest: () => noop, deliver: noop, checkDelivery: noop }}
                            />
                        </div>
                        <div>
                            <div className="mb-4 font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">COMPRADOR · INVITACIÓN MANDADA</div>
                            <DomainDeliveryStatus
                                recipient="comprador@correo.com"
                                progress={{ stepKey: 'domain-to-buyer', status: 'waiting', deadlineAt: PLAZO_DE_MUESTRA, attested: false }}
                            />
                        </div>
                        <div>
                            <div className="mb-4 font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">ANTES DE OFERTAR</div>
                            <DomainLockNotice />
                        </div>
                        <div>
                            <div className="mb-4 font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">ADMIN · SI LA CESIÓN NO LLEGÓ</div>
                            <RejectTransferForm action={noop} />
                        </div>
                        <div>
                            <div className="mb-4 font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">VENDEDOR · ANTES DE VENDER</div>
                            <SaleRequirementsPanel
                                steps={[
                                    {
                                        id: '1',
                                        key: 'domain-at-hostinger',
                                        check: 'declared',
                                        description: 'El vendedor tiene el dominio en Hostinger',
                                        title: 'Tené el dominio en Hostinger',
                                        instruction:
                                            'Para venderlo, el dominio tiene que estar en una cuenta de Hostinger: si hoy está en otro registrador, pedí el código EPP y mudalo antes de recibir ofertas.',
                                        details: [
                                            'Hostinger es el único registrador con el que trabajamos: desde ahí podemos recibir el dominio y entregárselo al comprador.',
                                        ],
                                    },
                                ]}
                            />
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
                    note="La entrada de /vender: una tarjeta por tipo de activo, con el logo, qué se hace y la llamada abajo. La de YouTube envía una acción (abre Google) cuando no hay canales conectados; con canales, o en la de sitio web, es un enlace. Arriba del recorrido, los pasos de cada tipo con el actual resaltado. El logo del sitio es una ventana de navegador (cuerpo blanco, barra azul con tres puntos y dos renglones) del mismo tamaño que el de YouTube: la forma misma es la marca, sin plataformas apiladas detrás."
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
                            description="Cargás los datos del sitio y comprobás que es tuyo con un registro en tu DNS."
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
                            <PriceSectionDemo initialCurrency="USD" initialPrice="13000" estimated={{ cents: 1_000_000, currency: 'USD' }} basis="los números verificados de tu canal" />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">SIN PRECIO NI VALUACIÓN</div>
                            <PriceSectionDemo initialCurrency="USD" initialPrice="" estimated={null} basis="los datos que cargaste" />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">EN PESOS — LA VALUACIÓN SE MUESTRA EN USD</div>
                            <PriceSectionDemo initialCurrency="ARS" initialPrice="13000000" estimated={{ cents: 1_000_000, currency: 'USD' }} basis="los números verificados de tu canal" />
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
                    note="Lo que ve el comprador con el activo en custodia: una sola decisión con dos opciones, cada una con lo necesario para ejecutarla ahí mismo. Mercado Pago deshabilitado es un botón deshabilitado de verdad, con el motivo y la alternativa; si no hay ninguna opción se dice una sola vez en lugar de mostrar dos callejones. La transferencia son dos: lo del vendedor a su cuenta y la comisión a la de la plataforma, cada una con su comprobante; con uno ya subido, Mercado Pago deja de ofrecerse. El vendedor espera, salvo que no tenga dónde cobrar; con un comprobante subido, confirma que le llegó o dice qué está mal, igual que la plataforma con la comisión. Las acciones son de muestra: no cobran nada."
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
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">COMPRADOR — MERCADO PAGO ELEGIDO</div>
                            <PaymentChoice options={PAGO_AMBAS} checkoutAction={noopVoid} initialView="mercadopago" />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">COMPRADOR — TRANSFERENCIA, ANTES DE EMPEZAR</div>
                            <PaymentChoice options={PAGO_AMBAS} checkoutAction={noopVoid} initialView="transfer-intro" />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">COMPRADOR — PASO 2, CON LA COMISIÓN ENVIADA</div>
                            <PaymentChoice
                                options={PAGO_AMBAS}
                                checkoutAction={noopVoid}
                                receipts={[{ recipient: 'platform', status: 'pending', uploadedAt: '2026-10-22T12:00:00.000Z', contentType: 'image/png' }]}
                                uploadActions={{ platform: noop, seller: noop }}
                            />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">COMPRADOR — LA COMISIÓN RECHAZADA</div>
                            <PaymentChoice
                                options={PAGO_AMBAS}
                                checkoutAction={noopVoid}
                                receipts={[
                                    {
                                        recipient: 'platform',
                                        status: 'rejected',
                                        uploadedAt: '2026-10-22T12:00:00.000Z',
                                        contentType: 'image/png',
                                        rejectionCode: 'amount_mismatch',
                                    },
                                ]}
                                uploadActions={{ platform: noop, seller: noop }}
                            />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">COMPRADOR — LOS DOS COMPROBANTES ENVIADOS</div>
                            <PaymentChoice
                                options={PAGO_AMBAS}
                                checkoutAction={noopVoid}
                                receipts={[
                                    { recipient: 'seller', status: 'pending', uploadedAt: '2026-10-22T12:00:00.000Z', contentType: 'image/png' },
                                    { recipient: 'platform', status: 'pending', uploadedAt: '2026-10-22T12:00:00.000Z', contentType: 'application/pdf' },
                                ]}
                                uploadActions={{ platform: noop, seller: noop }}
                            />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">VENDEDOR O PLATAFORMA — CONFIRMAR UN COMPROBANTE</div>
                            <ReceiptReviewForm
                                fileHref="/sistema"
                                confirmAction={noop}
                                rejectAction={noop}
                                expected="AR$ 1.425.000"
                                account="ejemplo.vendedor"
                                confirmText="Confirmar la acreditación"
                            />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">VENDEDOR — SIN DÓNDE COBRAR</div>
                            <SellerPaymentWait
                                options={{
                                    ...PAGO_AMBAS,
                                    mercadopago: { ...PAGO_AMBAS.mercadopago, available: false, reason: 'seller_not_linked' },
                                    transfer: { available: false, reason: 'seller_bank_missing', reference: PAGO_AMBAS.transfer.reference },
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
                            <SellMoreAside accessHref="#" subject="canal" showAccess showMercadoPago />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">VENDÉ MÁS RÁPIDO — SITIO</div>
                            <SellMoreAside accessHref="#" subject="sitio" showAccess showMercadoPago={false} />
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
                    note="Solo los dos pasos de antes de la venta, que se destraban de a uno: el primero lo tilda el vendedor en su navegador; el segundo avisa a la plataforma. Después el panel cuenta en qué va: verificando, cuenta regresiva (los días que informa el tipo de activo: siete en un canal, ninguno en un sitio, que no la muestra) o transferencia inmediata. El texto del beneficio y los pasos salen del tipo de activo, nunca fijos. «Ver cómo» abre un diálogo nativo con una maqueta animada de Google (se quieta con prefers-reduced-motion) y el texto «¿Por qué te pedimos esto?». Los pasos de la operación no aparecen acá."
                >
                    <div className="grid gap-8 lg:grid-cols-2">
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">PASOS — AÚN SIN AVISAR</div>
                            <AccessPanel listingId="muestra" subject="canal" waitingDays={7} steps={PASOS_DE_ACCESO} email="custodia-yt-01@forzalabs.online" status="pending" guided now={AHORA_DE_MUESTRA} requestAction={noop} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">VERIFICANDO</div>
                            <AccessPanel listingId="muestra-2" subject="canal" waitingDays={7} steps={PASOS_DE_ACCESO} email="custodia-yt-01@forzalabs.online" status="verifying" guided now={AHORA_DE_MUESTRA} requestAction={noop} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">CONFIRMADO — CUENTA REGRESIVA</div>
                            <AccessPanel listingId="muestra-3" subject="canal" waitingDays={7} steps={PASOS_DE_ACCESO} email="custodia-yt-01@forzalabs.online" status="waiting" transferableFrom="2026-10-17T12:00:00.000Z" guided now={AHORA_DE_MUESTRA} requestAction={noop} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">TRANSFERENCIA INMEDIATA</div>
                            <AccessPanel listingId="muestra-4" subject="canal" waitingDays={7} steps={PASOS_DE_ACCESO} email="custodia-yt-01@forzalabs.online" status="immediate" guided now={AHORA_DE_MUESTRA} requestAction={noop} />
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">SITIO — PASOS COMO TEXTO, SIN ESPERA</div>
                            <AccessPanel listingId="muestra-5" subject="sitio" waitingDays={0} steps={PASOS_DE_ACCESO_WEB} status="pending" guided={false} now={AHORA_DE_MUESTRA} requestAction={noop} />
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
                    note="Titularidad suma 1, acceso de administración suma 2 y Mercado Pago suma 1, sobre 4 (sobre 3 cuando Mercado Pago no está disponible: no se ofrece ni suma). La identidad verificada es requisito para publicar y no suma. Debajo del anillo, un desglose con el logo de cada logro (en la titularidad, la marca del tipo de activo: YouTube o el sitio): los que ya están llevan un tilde y sus puntos, los que faltan van apagados, y la fila de Mercado Pago no aparece cuando no está disponible. Lo que falta va en tarjetas con su botón; la identidad queda en una sola línea. En un sitio la titularidad no es una tarjeta aparte: el bloque «Comprobá que el sitio es tuyo» vive dentro de la tarjeta del sitio, junto a su nombre, y al comprobarse se cambia por una línea de constancia. El anillo va a la izquierda del título y el desglose ocupa el ancho, igual para YouTube y para el sitio."
                >
                    <div className="flex flex-col gap-8">
                        <div className="flex flex-wrap gap-4">
                            <div className="w-[260px]"><SellerLevelGauge assetType="youtube" ownershipVerified={false} accessRegistered={false} /></div>
                            <div className="w-[260px]"><SellerLevelGauge assetType="youtube" ownershipVerified accessRegistered={false} /></div>
                            <div className="w-[260px]"><SellerLevelGauge assetType="youtube" ownershipVerified accessRegistered mercadoPago="linked" /></div>
                            <div className="w-[260px]"><SellerLevelGauge assetType="youtube" ownershipVerified accessRegistered mercadoPago="unavailable" /></div>
                            <div className="w-[260px]"><SellerLevelGauge assetType="web" ownershipVerified accessRegistered={false} /></div>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">LOGO DEL SITIO — EN /VENDER, EN LA TARJETA Y EN LAS FILAS CHICAS</div>
                            <div className="flex flex-wrap items-center gap-6">
                                <WebLogo />
                                <WebMark width={52} />
                                <AssetMark assetType="web" width={22} />
                                <YouTubeLogo />
                            </div>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">TARJETA DEL SITIO EN LAS VERIFICACIONES — PIDE LA TITULARIDAD, CON LA SALIDA DE QUIEN NO PUEDE CARGAR EL REGISTRO</div>
                            <div className="grid gap-4 lg:grid-cols-[5fr_2fr]">
                                <AssetSummaryCard name="Siteweb" subtitle="deliaorrego.online · Entretenimiento" mark={<WebMark width={52} />}>
                                    <OwnershipCheck
                                        action={<DnsVerificationTrigger className="min-h-11 px-[18px] py-3" getChallenge={noopDnsChallenge} checkAction={noopDnsCheck} adsenseAction={noopVoid} />}
                                        alternative={<SendToReviewLink action={noop} />}
                                    />
                                </AssetSummaryCard>
                                <SellerLevelGauge assetType="web" ownershipVerified={false} accessRegistered={false} mercadoPago="linked" />
                            </div>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">TARJETA DEL SITIO CON TITULARIDAD COMPROBADA — LA CONSTANCIA EN VEZ DEL BLOQUE</div>
                            <div className="grid gap-4 lg:grid-cols-[5fr_2fr]">
                                <AssetSummaryCard name="Siteweb" subtitle="deliaorrego.online · Entretenimiento" mark={<WebMark width={52} />}>
                                    <OwnershipProof sourceLabel="tu DNS" />
                                </AssetSummaryCard>
                                <SellerLevelGauge assetType="web" ownershipVerified accessRegistered={false} mercadoPago="linked" />
                            </div>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">TARJETA DEL ACTIVO SIN MARCA NI BLOQUE — SE ALINEA ARRIBA, MIDE LO QUE SU CONTENIDO</div>
                            <AssetSummaryCard name="Tienda de muestra" subtitle="Sitio web" note="La titularidad se comprueba con un registro en el DNS del dominio." />
                        </div>
                        <VerificationCards
                            ownership={{ done: true, sourceLabel: 'YouTube', verifiedAt: AHORA_DE_MUESTRA }}
                            access={{ done: false }}
                            mercadoPago={{ done: false }}
                            ownershipSource="YouTube"
                            kycVerified
                            verifyAction={noopVoid}
                        />
                    </div>
                </Section>

                <Section
                    title="Titularidad de un sitio por DNS"
                    note="El sitio comprueba que es del vendedor con un registro TXT en su DNS, sin depender de AdSense. Tres pantallas. La primera es solo la pregunta, centrada, con ocho opciones en cuatro por dos y «No sé»: no hay nada más hasta contestar. Al elegir, las opciones pasan de golpe a una columna a la izquierda (sin animación) y a la derecha entra, con un fundido, «Vas a cargarlo en…» con los tres pasos. El proveedor lo elige el vendedor y nunca se preselecciona: deducirlo de los servidores de nombres puede fallar (un dominio comprado en Hostinger puede tener el DNS en Netlify, que usa nsone.net). «No sé» elige lo que se deduce y lo dice, con cómo averiguarlo; si no se deduce nada, lo dice y no elige. «Otro» da pasos genéricos. La segunda pantalla es el registro, con el valor para copiar, la aclaración del TTL y, en pantallas anchas, una maqueta genérica de un panel de DNS que escribe el valor real; con movimiento reducido queda en su estado final. «Ya lo cargué» lleva a la tercera, la lista de lo que se comprobó: mientras busca gira un indicador, y al encontrar el registro dice «Listo» y ofrece publicar. Consulta cada 10 segundos, unos 5 minutos como máximo: primero dice que lo busca, después que puede tardar, al final deja de buscar y pide «Buscar de nuevo». AdSense queda como alternativa en la pantalla del registro, porque además verifica los ingresos."
                >
                    <div className="grid gap-8">
                        {(
                            [
                                ['1 · SIN ELEGIR — LA PREGUNTA CENTRADA', { challenge: DNS_NETLIFY, status: 'searching' }],
                                ['1 · PROVEEDOR ELEGIDO — OPCIONES A LA IZQUIERDA, PASOS A LA DERECHA', { challenge: DNS_NETLIFY, status: 'searching', selectedProvider: 'netlify' }],
                                ['1 · «NO SÉ» — SE DEDUCE EL PROVEEDOR', { challenge: DNS_NETLIFY, status: 'searching', selectedProvider: 'netlify', unsure: true }],
                                ['1 · «NO SÉ» — NO SE PUDO DEDUCIR', { challenge: DNS_UNKNOWN, status: 'searching', unsure: true }],
                                ['1 · «OTRO» — PASOS GENÉRICOS', { challenge: DNS_UNKNOWN, status: 'searching', selectedProvider: 'other' }],
                                ['2 · EL REGISTRO EN UN PROVEEDOR', { step: 'record', challenge: DNS_NETLIFY, status: 'searching', selectedProvider: 'netlify' }],
                                ['2 · EL REGISTRO DE UN SUBDOMINIO, EN «OTRO»', { step: 'record', challenge: DNS_SUBDOMAIN, status: 'searching', selectedProvider: 'other' }],
                                ['3 · BUSCANDO', { step: 'result', challenge: DNS_NETLIFY, status: 'searching', selectedProvider: 'netlify' }],
                                ['3 · TODAVÍA NO LO VE', { step: 'result', challenge: DNS_UNKNOWN, status: 'delayed', selectedProvider: 'other' }],
                                ['3 · DEJÓ DE BUSCAR', { step: 'result', challenge: DNS_SUBDOMAIN, status: 'stopped', selectedProvider: 'cloudflare' }],
                                ['3 · SIN CONFIGURAR', { step: 'result', challenge: DNS_NETLIFY, status: 'error', selectedProvider: 'netlify', error: 'La comprobación por DNS todavía no está disponible. Probá más tarde o comprobalo con AdSense.' }],
                                ['3 · VERIFICADO — PUBLICAR', { step: 'result', challenge: DNS_NETLIFY, status: 'verified', selectedProvider: 'netlify', publishAction: noop }],
                                ['3 · VERIFICADO — SIN BORRADOR QUE PUBLICAR', { step: 'result', challenge: DNS_NETLIFY, status: 'verified', selectedProvider: 'netlify' }],
                                ['PREPARANDO EL REGISTRO', { challenge: null, status: 'searching' }],
                                ['NO SE PUDO PEDIR EL REGISTRO', { challenge: null, status: 'searching', loadError: 'No pudimos consultar tu DNS. Probá de nuevo.' }],
                            ] as const
                        ).map(([label, props]) => (
                            <div key={label} className="flex flex-col gap-3">
                                <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">{label}</div>
                                <div className="rounded-[var(--radius-grande)] border border-[var(--color-borde-fuerte)] bg-[var(--color-superficie)]">
                                    <DnsVerificationDialogView {...props} checking={false} adsenseAction={noopVoid} />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-8 flex flex-col gap-8">
                        <div className="flex max-w-[640px] flex-col gap-3">
                            <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">BORRADOR DE UN SITIO SIN TITULARIDAD</div>
                            <DraftPanel
                                variant="unverified"
                                subject="sitio"
                                sourceLabel="tu DNS"
                                price="US$ 1.500"
                                kycVerified
                                publishAction={noop}
                                reviewAction={noop}
                                verifyAction={noopVoid}
                                dnsVerification={
                                    <DnsVerificationTrigger
                                        className="min-h-[52px] px-7 text-[16px]"
                                        getChallenge={noopDnsChallenge}
                                        checkAction={noopDnsCheck}
                                        adsenseAction={noopVoid}
                                        publishAction={noop}
                                    />
                                }
                            />
                        </div>
                    </div>
                </Section>
            </div>
        </div>
    );
}
