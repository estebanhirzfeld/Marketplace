import type { OperationStatusDto } from '@marketplace/api-contract';

/**
 * Las etapas del escrow, en el orden real del dominio.
 *
 * `cancelled` no es una etapa del flujo sino una salida, así que no se dibuja
 * en el riel.
 */
const ETAPAS: Array<{ state: OperationStatusDto; title: string; text: string }> = [
    { state: 'offer_sent', title: 'Oferta enviada', text: 'El comprador puso un precio sobre la mesa.' },
    { state: 'negotiating', title: 'Negociación', text: 'Van y vienen contraofertas hasta que una parte acepta.' },
    { state: 'contract_pending', title: 'Contrato pendiente', text: 'Falta que firmen comprador y vendedor.' },
    { state: 'contract_signed', title: 'Contrato firmado', text: 'Las tres partes quedaron obligadas.' },
    { state: 'transfer_in_progress', title: 'Transferencia', text: 'El vendedor cede la titularidad a la plataforma.' },
    { state: 'asset_in_custody', title: 'Activo en custodia', text: 'La plataforma verificó el activo. Recién acá se pide el pago.' },
    { state: 'payment_received', title: 'Pago recibido', text: 'El comprador transfirió. Falta liquidar y entregar.' },
    { state: 'completed', title: 'Operación cerrada', text: 'El comprador tiene el activo; el vendedor, su plata.' },
];

const ORDEN = ETAPAS.map((e) => e.state);

export function Timeline({ actual }: { actual: OperationStatusDto }) {
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
                const isCustodyStage = etapa.state === 'asset_in_custody';

                return (
                    <li key={etapa.state} className="flex gap-4">
                        {/* Riel: punto + línea que conecta con la etapa siguiente */}
                        <div className="flex flex-col items-center">
                            {/*
                                Una etapa cumplida se marcaba solo por color y opacidad,
                                así que quien no distingue el verde del gris no podía
                                saber por dónde va la operación. El tilde dice lo mismo
                                sin depender del color, y el texto para lectores de
                                pantalla lo dice sin depender de la forma.
                            */}
                            {hecha ? (
                                <span
                                    className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--color-acento)]/20 text-[11px] font-bold leading-none text-[var(--color-acento)]"
                                    aria-hidden
                                >
                                    ✓
                                </span>
                            ) : (
                                <span
                                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${
                                        esActual
                                            ? 'border-[var(--color-acento)] bg-[var(--color-acento)] late'
                                            : 'border-[var(--color-borde-fuerte)] bg-transparent'
                                    }`}
                                    aria-hidden
                                />
                            )}
                            <span className="sr-only">
                                {hecha ? 'Etapa cumplida' : esActual ? 'Etapa actual' : 'Etapa pendiente'}
                            </span>
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
                                <span className="text-[15px] font-medium">{etapa.title}</span>
                                {isCustodyStage && (
                                    <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-acento)]">
                                        PUNTO DE CONTROL
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 max-w-[440px] text-[13px] leading-relaxed text-[var(--color-tenue)]">
                                {etapa.text}
                            </p>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}
