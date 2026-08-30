import { Revelar } from '@/components/Revelar';
import { LineaTiempo } from '@/components/LineaTiempo';
import { Candado } from '@/components/Candado';
import {
    Aviso,
    Boton,
    BotonEnlace,
    Campo,
    EstadoOperacion,
    Panel,
    Titulo,
    Vacio,
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

function Seccion({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
    return (
        <section className="border-b border-[var(--color-borde)] py-12">
            <div className="mb-6 flex flex-col gap-1.5">
                <h2 className="text-[21px] font-bold tracking-[-0.02em]">{titulo}</h2>
                {nota && <p className="max-w-[620px] text-[14px] leading-relaxed text-[var(--color-tenue)]">{nota}</p>}
            </div>
            {children}
        </section>
    );
}

export default function Sistema() {
    return (
        <div className="mx-auto max-w-[1100px] px-6 py-16 sm:px-12">
            <Revelar>
                <Titulo sub="Cada componente en cada estado, con los tokens reales de la aplicación. Si cambia la identidad de marca, se cambia el bloque @theme de globals.css y todo esto se actualiza solo.">
                    Sistema de diseño
                </Titulo>
            </Revelar>

            <div className="mt-10">
                <Seccion
                    titulo="Color"
                    nota="El único color saturado además del acento es el ámbar, y está reservado a un significado: dato bajo NDA. El color señala el diferencial del producto en vez de decorar."
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
                </Seccion>

                <Seccion titulo="Tipografía" nota="Space Grotesk para texto; JetBrains Mono para números, códigos y etiquetas de estado. Los números siempre en mono: alinean en columna y se comparan de un vistazo.">
                    <div className="flex flex-col gap-4">
                        <div className="text-[55px] font-bold leading-[1.05] tracking-[-0.035em]">Titular 55 / 700</div>
                        <div className="text-[34px] font-bold tracking-[-0.03em]">Sección 34 / 700</div>
                        <div className="text-[17px] font-medium">Subtítulo 17 / 500</div>
                        <div className="text-[15px] text-[var(--color-tenue)]">Cuerpo 15 / 400 en texto tenue</div>
                        <div className="font-mono text-[13px]">USD 15.000 · 55.000 subs · 12,5×</div>
                        <div className="font-mono text-[11px] tracking-[0.1em] text-[var(--color-apagado)]">
                            ETIQUETA MONO 11 / TRACKING 0.1EM
                        </div>
                    </div>
                </Seccion>

                <Seccion titulo="Acciones">
                    <div className="flex flex-wrap items-center gap-3">
                        <Boton variante="primario">Primario</Boton>
                        <Boton variante="secundario">Secundario</Boton>
                        <Boton variante="fantasma">Fantasma</Boton>
                        <Boton variante="peligro">Cancelar operación</Boton>
                        <Boton variante="primario" disabled>Deshabilitado</Boton>
                        <BotonEnlace href="/listings" variante="secundario">Enlace con forma de botón</BotonEnlace>
                    </div>
                </Seccion>

                <Seccion titulo="Estados de la operación" nota="Cada estado del dominio tiene una etiqueta y un color propios. En custodia y completada usan el acento porque son los dos momentos en que el riesgo baja.">
                    <div className="flex flex-wrap gap-2.5">
                        {ESTADOS.map((e) => (
                            <EstadoOperacion key={e} estado={e} />
                        ))}
                    </div>
                </Seccion>

                <Seccion titulo="Confidencialidad">
                    <div className="flex flex-wrap items-center gap-4">
                        <span className="flex items-center gap-1.5 rounded-[var(--radius-chico)] border border-[var(--color-alerta)]/40 px-2.5 py-1">
                            <Candado />
                            <span className="font-mono text-[10px] text-[var(--color-alerta)]">NDA</span>
                        </span>
                        <span className="text-[14px] text-[var(--color-tenue)]">
                            Marca un activo cuyos datos sensibles están ocultos hasta firmar.
                        </span>
                    </div>
                </Seccion>

                <Seccion titulo="Formularios">
                    <div className="grid max-w-[520px] gap-4">
                        <Campo etiqueta="Email" type="email" placeholder="vos@ejemplo.com" />
                        <Campo etiqueta="Contraseña" type="password" ayuda="Mínimo 8 caracteres, con al menos una letra y un número." />
                    </div>
                </Seccion>

                <Seccion titulo="Superficies y mensajes">
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Panel titulo="PANEL CON TÍTULO">
                            <p className="text-[14px] leading-relaxed text-[var(--color-tenue)]">
                                Contenedor por defecto de cualquier bloque de datos.
                            </p>
                        </Panel>
                        <div className="flex flex-col gap-4">
                            <Aviso>Email o contraseña incorrectos.</Aviso>
                            <Aviso tono="alerta">Necesitás verificar tu identidad para firmar.</Aviso>
                        </div>
                    </div>
                    <div className="mt-4">
                        <Vacio
                            titulo="Todavía no hay ofertas"
                            texto="Cuando alguien oferte por este activo vas a verlo acá, con el monto y a quién le toca responder."
                            accion={<BotonEnlace href="/listings" variante="secundario">Ver el mercado</BotonEnlace>}
                        />
                    </div>
                </Seccion>

                <Seccion titulo="Línea de tiempo del escrow" nota="El mismo componente en dos momentos distintos. La etapa de custodia está marcada como punto de control porque es donde la plataforma asume el riesgo.">
                    <div className="grid gap-10 lg:grid-cols-2">
                        <div>
                            <div className="mb-4 font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">NEGOCIANDO</div>
                            <LineaTiempo actual="negotiating" />
                        </div>
                        <div>
                            <div className="mb-4 font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">EN CUSTODIA</div>
                            <LineaTiempo actual="asset_in_custody" />
                        </div>
                    </div>
                </Seccion>
            </div>
        </div>
    );
}
