import type { ContractDocumentDto } from '@marketplace/api-contract';
import { Alert, Panel } from './ui';

/**
 * El texto del contrato, para leerlo antes de firmar.
 *
 * Muestra la huella SHA-256 porque es lo que ata la firma a este texto exacto:
 * si mañana alguien discute qué se firmó, el documento se regenera y se
 * compara la huella.
 */
export function ContractDocumentPanel({ doc }: { doc: ContractDocumentDto }) {
    return (
        <div className="flex flex-col gap-4">
            {/* Que el text vigente no sea el signed es lo más grave que puede
                informar esta pantalla: va arriba de todo. */}
            {!doc.matches && (
                <Alert>
                    El text que ves ahora no matches con el que se firmó. Alguno de los form de
                    la operación cambió después de la firma. No avances sin revisarlo.
                </Alert>
            )}

            <Panel title="DOCUMENTO">
                <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-[var(--color-tenue)]">
                    {doc.text}
                </pre>
            </Panel>

            <div className="flex flex-col gap-2 rounded-[var(--radius-chico)] border border-[var(--color-borde)] p-4">
                <div className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-apagado)]">
                    HUELLA SHA-256 DEL DOCUMENTO
                </div>
                <code className="break-all font-mono text-[12px] text-[var(--color-tinta)]">
                    {doc.hash}
                </code>
                <p className="text-[12px] leading-relaxed text-[var(--color-apagado)]">
                    {doc.signed
                        ? 'Cada firma quedó atada a esta huella. Cualquier cambio posterior al texto la alteraría y sería detectable.'
                        : 'Al firmar, tu firma queda atada a esta huella. Si el texto cambiara después, dejaría de corresponderle.'}
                </p>
            </div>
        </div>
    );
}
