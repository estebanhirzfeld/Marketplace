import type { OperationStatusDto } from '@marketplace/api-contract';

/**
 * Las etapas del escrow, en el orden real del dominio.
 *
 * `cancelled` no es una etapa del flujo sino una salida, así que no se dibuja
 * en el riel.
 */
const ETAPAS: Array<{ estado: OperationStatusDto; titulo: string; texto: string }> = [
    { estado: 'offer_sent', titulo: 'Oferta enviada', texto: 'El comprador puso un precio sobre la mesa.' },
    { estado: 'negotiating', titulo: 'Negociación', texto: 'Van y vienen contraofertas hasta que una parte acepta.' },
    { estado: 'contract_pending', titulo: 'Contrato pendiente', texto: 'Falta que firmen comprador y vendedor.' },
    { estado: 'contract_signed', titulo: 'Contrato firmado', texto: 'Las tres partes quedaron obligadas.' },
    { estado: 'transfer_in_progress', titulo: 'Transferencia', texto: 'El vendedor cede la titularidad a la plataforma.' },
    { estado: 'asset_in_custody', titulo: 'Activo en custodia', texto: 'La plataforma verificó el activo. Recién acá se pide el pago.' },
    { estado: 'payment_received', titulo: 'Pago recibido', texto: 'El comprador transfirió. Falta liquidar y entregar.' },
    { estado: 'completed', titulo: 'Operación cerrada', texto: 'El comprador tiene el activo; el vendedor, su plata.' },
];

const ORDEN = ETAPAS.map((e) => e.estado);

export function LineaTiempo({ actual }: { actual: OperationStatusDto }) {
    if (actual === 'cancelled') {
        return (
            <div className="rounded-[var(--radius-medio)] border border-[var(--color-borde)] p-6">
                <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">
                    OPERACIÓN CANCELADA
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-tenue)]">
                    Se canceló antes de que las partes quedaran comprometidas. Después de firmar el
                    contrato la cancelación ya no es posible.
                </p>
            </div>
        );
    }

    const indiceActual = ORDEN.indexOf(actual);

    return (
        <ol className="flex flex-col">
            {ETAPAS.map((etapa, i) => {
                const hecha = i < indiceActual;
                const esActual = i === indiceActual;
                const custodia = etapa.estado === 'asset_in_custody';

                return (
                    <li key={etapa.estado} className="flex gap-4">
                        {/* Riel: punto + línea que conecta con la etapa siguiente */}
                        <div className="flex flex-col items-center">
                            <span
                                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${
                                    esActual
                                        ? 'border-[var(--color-acento)] bg-[var(--color-acento)]'
                                        : hecha
                                          ? 'border-[var(--color-acento)]/50 bg-[var(--color-acento)]/50'
                                          : 'border-[var(--color-borde-fuerte)] bg-transparent'
                                } ${esActual ? 'late' : ''}`}
                            />
                            {i < ETAPAS.length - 1 && (
                                <span
                                    className={`w-px flex-1 ${
                                        hecha ? 'bg-[var(--color-acento)]/40' : 'bg-[var(--color-borde)]'
                                    }`}
                                />
                            )}
                        </div>

                        <div className={`pb-7 ${esActual ? '' : 'opacity-60'}`}>
                            <div className="flex items-center gap-2.5">
                                <span className="text-[15px] font-medium">{etapa.titulo}</span>
                                {custodia && (
                                    <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-acento)]">
                                        PUNTO DE CONTROL
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 max-w-[440px] text-[13px] leading-relaxed text-[var(--color-tenue)]">
                                {etapa.texto}
                            </p>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}
