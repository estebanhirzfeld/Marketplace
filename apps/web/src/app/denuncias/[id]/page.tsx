import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ApiError } from '@marketplace/api-client';
import type { EvidenceDossierDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { currentActor } from '@/lib/session';
import { Reveal } from '@/components/Reveal';
import { Panel, Heading } from '@/components/ui';
import { MOTIVOS } from '@/components/ReportReasons';
import { money } from '@/lib/format';

export const metadata = { title: 'Legajo · Traspaso' };

/**
 * El legajo de un reclamo.
 *
 * Es lo único que la plataforma entrega ante un fraude, y es todo lo que puede
 * entregar con honestidad: no dice quién tiene razón, reúne lo que registró
 * mientras la operación transcurría. Lo ven las dos partes, con el mismo
 * contenido, porque un reclamo que el denunciado no puede leer ni responder no
 * le sirve a nadie.
 */
export default async function Legajo(props: { params: Promise<{ id: string }> }) {
    // En Next 16 `params` es una promesa: el acceso sincrónico se eliminó.
    const { id } = await props.params;

    if (!(await currentActor())) redirect('/ingresar');

    let d: EvidenceDossierDto;
    try {
        d = await api().legajo(id);
    } catch (e) {
        if (e instanceof ApiError && e.code === 'NOT_FOUND') notFound();
        throw e;
    }

    return (
        <div className="mx-auto max-w-[1000px] px-6 py-14 sm:px-12">
            <Reveal>
                <Heading sub="Todo lo que la plataforma registró de esta operación, reunido para que puedas presentarlo donde corresponda. La plataforma no dictamina quién tiene razón.">
                    {MOTIVOS[d.reason]}
                </Heading>
            </Reveal>

            <div className="mt-10 flex flex-col gap-6">
                <Reveal>
                    <Panel title="EL RECLAMO">
                        <div className="flex flex-col gap-2.5">
                            <p className="text-[14px] leading-relaxed">{d.detail}</p>
                            <p className="text-[12px] text-[var(--color-apagado)]">
                                Presentado el {fecha(d.filedAt)}.
                            </p>
                        </div>
                    </Panel>
                </Reveal>

                <div className="grid gap-6 lg:grid-cols-2">
                    <Reveal>
                        <Panel title="QUIEN RECLAMA">
                            <Identidad parte={d.reporter} />
                        </Panel>
                    </Reveal>
                    <Reveal delay={80}>
                        <Panel title="PARTE RECLAMADA">
                            <Identidad parte={d.reported} />
                        </Panel>
                    </Reveal>
                </div>

                <Reveal>
                    <Panel title="LA OPERACIÓN">
                        <div className="flex flex-col gap-2.5 text-[14px]">
                            <Fila etiqueta="Estado" valor={d.operation.status} />
                            {d.operation.finalPriceCents !== undefined && (
                                <Fila
                                    etiqueta="Precio acordado"
                                    valor={money({
                                        cents: d.operation.finalPriceCents,
                                        currency: d.operation.currency,
                                    })}
                                />
                            )}
                            <Fila etiqueta="Iniciada" valor={fecha(d.operation.createdAt)} />
                            {d.operation.completedAt && (
                                <Fila etiqueta="Cerrada" valor={fecha(d.operation.completedAt)} />
                            )}
                        </div>
                    </Panel>
                </Reveal>

                <Reveal>
                    <Panel title="HISTORIAL DE LA NEGOCIACIÓN">
                        <div className="flex flex-col divide-y divide-[var(--color-borde-sutil)]">
                            {d.negotiations.map((n, i) => (
                                <div key={i} className="flex justify-between py-2.5 text-[13px]">
                                    <span className="text-[var(--color-tenue)]">
                                        {n.proposedBy === 'buyer' ? 'El comprador propuso' : 'El vendedor propuso'}
                                    </span>
                                    <span className="flex gap-4">
                                        <span className="font-mono">
                                            {money({ cents: n.amount, currency: n.currency })}
                                        </span>
                                        <span className="text-[var(--color-apagado)]">
                                            {fecha(n.proposedAt)}
                                        </span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </Panel>
                </Reveal>

                <Reveal>
                    <Panel title="LO QUE SE DECLARÓ DEL ACTIVO">
                        <div className="flex flex-col divide-y divide-[var(--color-borde-sutil)]">
                            {Object.entries(d.declaredAsset.assetData).map(([clave, valor]) => (
                                <div key={clave} className="flex justify-between py-2.5 text-[13px]">
                                    <span className="text-[var(--color-tenue)]">{clave}</span>
                                    <span className="font-mono break-all">{String(valor)}</span>
                                </div>
                            ))}
                        </div>
                    </Panel>
                </Reveal>

                <Reveal>
                    <Panel title="VERIFICACIONES DE LA PLATAFORMA">
                        <div className="flex flex-col gap-4 text-[13px]">
                            {d.verifications.ownership ? (
                                <Bloque titulo="Titularidad del activo">
                                    Comprobada contra {d.verifications.ownership.source} el{' '}
                                    {fecha(d.verifications.ownership.verifiedAt)}. Identificador
                                    devuelto por la fuente:{' '}
                                    <span className="font-mono">{d.verifications.ownership.assetId}</span>.
                                    {d.verifications.ownership.monthlyRevenueCents !== undefined && (
                                        <>
                                            {' '}Ingreso comprobado:{' '}
                                            <span className="font-mono">
                                                {money({
                                                    cents: d.verifications.ownership.monthlyRevenueCents,
                                                    currency: 'USD',
                                                })}
                                            </span>
                                            .
                                        </>
                                    )}
                                </Bloque>
                            ) : (
                                <Bloque titulo="Titularidad del activo">
                                    No se comprobó. El vendedor nunca demostró controlar el activo
                                    contra su fuente.
                                </Bloque>
                            )}

                            {d.verifications.custody && (
                                <Bloque titulo="Custodia del activo">
                                    Verificada el {fecha(d.verifications.custody.verifiedAt)}.
                                    Propiedad principal:{' '}
                                    {d.verifications.custody.isPrimaryOwner ? 'sí' : 'no'}. Accesos
                                    asegurados: {d.verifications.custody.accessSecured ? 'sí' : 'no'}.
                                    {Object.entries(d.verifications.custody.metrics).length > 0 && (
                                        <>
                                            {' '}Métricas al momento de la custodia:{' '}
                                            {Object.entries(d.verifications.custody.metrics)
                                                .map(([k, v]) => `${k}: ${v.toLocaleString('es-AR')}`)
                                                .join(', ')}
                                            .
                                        </>
                                    )}
                                </Bloque>
                            )}
                        </div>
                    </Panel>
                </Reveal>

                <Reveal>
                    <Panel title="CONTRATOS FIRMADOS">
                        <div className="flex flex-col gap-5">
                            {d.contracts.map((c) => (
                                <div key={c.id} className="flex flex-col gap-2.5">
                                    <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-apagado)]">
                                        {c.type.toUpperCase()}
                                    </span>
                                    {c.documentHash && (
                                        <p className="text-[12px] leading-relaxed">
                                            <span className="text-[var(--color-tenue)]">
                                                Huella SHA-256 del documento:{' '}
                                            </span>
                                            <span className="font-mono break-all">{c.documentHash}</span>
                                        </p>
                                    )}
                                    {c.signatures
                                        .filter((s) => s.signedAt)
                                        .map((s, i) => (
                                            <p key={i} className="text-[12px] text-[var(--color-apagado)]">
                                                Firmó <strong>{s.role}</strong> el {fecha(s.signedAt!)}
                                                {s.ipAddress && (
                                                    <> desde <span className="font-mono">{s.ipAddress}</span></>
                                                )}
                                                .
                                            </p>
                                        ))}
                                </div>
                            ))}
                        </div>
                    </Panel>
                </Reveal>

                <Reveal>
                    <p className="text-[13px] leading-relaxed text-[var(--color-tenue)]">
                        La plataforma reúne y conserva esta documentación, pero no arbitra el fondo
                        del reclamo ni responde por el incumplimiento de una de las partes. Con este
                        legajo podés iniciar las acciones que correspondan.{' '}
                        <Link href="/denuncias" className="text-[var(--color-acento)]">
                            Volver a mis reclamos
                        </Link>
                    </p>
                </Reveal>
            </div>
        </div>
    );
}

function Identidad({ parte }: { parte: EvidenceDossierDto['reporter'] }) {
    return (
        <div className="flex flex-col gap-2.5 text-[14px]">
            <Fila etiqueta="Nombre" valor={parte.fullName} />
            {parte.dni && <Fila etiqueta="DNI" valor={parte.dni} />}
            <Fila etiqueta="Correo" valor={parte.email} />
            {parte.country && <Fila etiqueta="País" valor={parte.country} />}
        </div>
    );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
    return (
        <div className="flex justify-between gap-4">
            <span className="text-[var(--color-tenue)]">{etiqueta}</span>
            <span className="font-mono break-all text-right">{valor}</span>
        </div>
    );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="font-medium">{titulo}</span>
            <p className="leading-relaxed text-[var(--color-apagado)]">{children}</p>
        </div>
    );
}

function fecha(iso: string): string {
    return new Date(iso).toLocaleDateString('es-AR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}
