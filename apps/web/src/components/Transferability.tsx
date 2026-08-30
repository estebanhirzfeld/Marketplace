/**
 * Cuándo se puede cerrar la operación sobre este activo.
 *
 * Nunca dice "listo" a secas. La plataforma no puede comprobar por API que
 * sigue teniendo acceso al canal —YouTube no expone quiénes son los
 * propietarios— así que lo único honesto es mostrar la fecha del cálculo y
 * dejar que quien mira saque su conclusión.
 */

const FORMATO: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };

export function fechaCorta(iso: string): string {
    return new Date(iso).toLocaleDateString('es-AR', FORMATO);
}

/** Versión compacta, para la grilla. */
export function TransferableBadge({
    transferable,
    transferableFrom,
}: {
    transferable: boolean;
    transferableFrom?: string;
}) {
    if (transferable) {
        return (
            <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-acento)]">
                TRANSFERENCIA INMEDIATA
            </span>
        );
    }

    // Sin acceso registrado no se muestra nada: la mayoría de los listings
    // están así y un cartel de "no disponible" en todos sería solo ruido.
    if (!transferableFrom) return null;

    return (
        <span className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-apagado)]">
            DESDE EL {fechaCorta(transferableFrom).toUpperCase()}
        </span>
    );
}

/** Versión explicada, para el detalle del activo. */
export function TransferStatus({
    transferable,
    transferableFrom,
}: {
    transferable: boolean;
    transferableFrom?: string;
}) {
    if (transferable) {
        return (
            <Block accent title="Transferencia inmediata">
                La plataforma ya tiene el acceso que necesita para tomar la custodia de este
                activo. Si cerrás la compra hoy, la entrega no queda esperando ningún plazo.
            </Block>
        );
    }

    if (transferableFrom) {
        return (
            <Block title={`Transferible desde el ${fechaCorta(transferableFrom)}`}>
                El vendedor ya cedió el acceso, pero YouTube exige esperar siete días antes de
                permitir el cambio de titularidad. Podés ofertar y negociar desde ahora: el
                contrato se firma cuando se cumple ese plazo.
            </Block>
        );
    }

    return (
        <Block title="El acceso todavía no está cedido">
            El vendedor todavía no le dio acceso al activo a la plataforma. Podés ofertar y
            negociar, pero el contrato no se va a poder firmar hasta que lo haga y se cumpla el
            plazo de espera que exige YouTube.
        </Block>
    );
}

function Block({
    title,
    children,
    accent = false,
}: {
    title: string;
    children: React.ReactNode;
    accent?: boolean;
}) {
    return (
        <div
            className={`flex flex-col gap-1.5 rounded-[var(--radius-chico)] border p-4 ${
                accent
                    ? 'border-[var(--color-acento)]/40 bg-[var(--color-acento)]/[0.04]'
                    : 'border-[var(--color-borde)]'
            }`}
        >
            <span
                className={`text-[13px] font-medium ${accent ? 'text-[var(--color-acento)]' : ''}`}
            >
                {title}
            </span>
            <p className="text-[12px] leading-relaxed text-[var(--color-apagado)]">{children}</p>
        </div>
    );
}
