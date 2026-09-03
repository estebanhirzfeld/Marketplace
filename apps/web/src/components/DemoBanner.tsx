/**
 * Aviso permanente de entorno de demostración.
 *
 * Aparece en todas las páginas, con o sin sesión. No es descartable a
 * propósito: la comisión evaluadora y cualquier visitante tienen que poder ver
 * en todo momento que esto no es una plataforma en producción, que la
 * verificación de identidad y de pago está simulada, y que ninguna operación
 * hecha acá tiene efecto legal.
 */
export function DemoBanner() {
    return (
        <div
            role="note"
            className="border-b border-[var(--color-borde)] bg-[var(--color-superficie-alta)]"
        >
            <div className="mx-auto max-w-[1400px] px-6 py-2 sm:px-12">
                <p className="text-[12px] leading-relaxed text-[var(--color-tenue)]">
                    <span className="font-mono text-[10px] tracking-[0.12em] text-[var(--color-apagado)]">
                        ENTORNO DE DEMOSTRACIÓN
                    </span>
                    <span className="mx-2 text-[var(--color-borde-fuerte)]">·</span>
                    La verificación de identidad y de pago es simulada. Las
                    operaciones, contratos y firmas que se hagan acá no tienen
                    validez legal ni mueven dinero real.
                </p>
            </div>
        </div>
    );
}
