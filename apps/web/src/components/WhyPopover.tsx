/**
 * «¿Por qué te pedimos esto?», paso por paso.
 *
 * Los textos son un compromiso con el vendedor y están fijados por diseño: lo
 * que sigue vale tal cual, con sus negritas. Es presentacional para poder
 * leerlo en un test sin abrir el modal.
 */
export function WhyPopover({ step }: { step: 0 | 1 }) {
    return (
        <div
            role="tooltip"
            className="absolute bottom-12 left-0 z-10 flex w-[320px] max-w-[calc(100vw-4rem)] flex-col gap-2 rounded-[var(--radius-medio)] border border-[var(--color-borde-fuerte)] bg-[var(--color-superficie-alta)] px-4 py-3.5 text-[13px] leading-relaxed text-[#c4c8cd] shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
        >
            {step === 0 ? (
                <>
                    <span>
                        <Strong>Google</Strong> solo deja pasar a otra persona los canales que están en una cuenta
                        de marca.
                    </span>
                    <span>
                        Tus videos, suscriptores y el nombre del canal se mantienen. <Strong>Seguís siendo el dueño</Strong>.
                    </span>
                </>
            ) : (
                <>
                    <span>
                        Para que el canal pueda pasar al comprador el mismo día que se firma la venta.{' '}
                        <Strong>Google</Strong> exige 7 días de espera.
                    </span>
                    <span>
                        <Strong>Con ese rol no podemos</Strong> borrar tu canal, sacarte a vos ni pasárselo a nadie.
                    </span>
                </>
            )}
        </div>
    );
}

function Strong({ children }: { children: React.ReactNode }) {
    return <strong className="font-semibold text-[var(--color-tinta)]">{children}</strong>;
}
