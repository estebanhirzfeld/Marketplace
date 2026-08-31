'use client';

import { useEffect, useRef } from 'react';

/**
 * Revela su contenido cuando entra en pantalla.
 *
 * Existe porque las secciones "pasaban de largo": animar todo al cargar la
 * página significa que el usuario se pierde el 80 % del movimiento. Esto lo
 * dispara cuando el bloque efectivamente aparece.
 *
 * Es de los pocos componentes cliente de la app; todo lo demás se renderiza
 * en el servidor.
 */
export function Reveal({
    children,
    delay = 0,
    trazo = false,
    className,
}: {
    children?: React.ReactNode;
    /** Milisegundos de retraso, para escalonar hermanos. */
    delay?: number;
    /** Anima un trazo horizontal en vez de una entrada desde abajo. */
    trazo?: boolean;
    className?: string;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const observador = new IntersectionObserver(
            ([entrada]) => {
                if (entrada.isIntersecting) {
                    el.setAttribute('data-visible', '');
                    observador.disconnect();
                }
            },
            { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
        );

        observador.observe(el);
        return () => observador.disconnect();
    }, []);

    const props = trazo ? { 'data-trazo': '' } : { 'data-revelar': '' };

    return (
        <div
            ref={ref}
            {...props}
            className={className}
            style={{ '--retraso': `${delay}ms` } as React.CSSProperties}
        >
            {children}
        </div>
    );
}
