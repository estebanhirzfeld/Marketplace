import { Reveal } from '@/components/Reveal';
import { Timeline } from '@/components/Timeline';
import { LockIcon } from '@/components/LockIcon';
import { NotificationDropdown } from '@/components/NotificationDropdown';
import { TransferStatus, TransferableBadge } from '@/components/Transferability';
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
import type { OperationStatusDto } from '@marketplace/api-contract';

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
const AYER = new Date(Date.now() - DIA).toISOString();
const EN_CINCO_DIAS = new Date(Date.now() + 5 * DIA).toISOString();

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
            </div>
        </div>
    );
}
