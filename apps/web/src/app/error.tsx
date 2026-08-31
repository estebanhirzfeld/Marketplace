'use client';

import { useEffect } from 'react';

/**
 * La red de contención de la aplicación.
 *
 * No existía, así que un error del servidor —la API caída, por ejemplo—
 * mostraba la pantalla por defecto de Next, en inglés y sin forma de
 * reintentar. `error.tsx` tiene que ser un componente de cliente: Next lo
 * necesita así para poder volver a montar el árbol con `reset`.
 *
 * No se muestra el mensaje del error: puede traer detalles internos y a quien
 * está del otro lado no le sirven. Va a la consola, que es donde se lee.
 */
export default function ErrorDeLaPagina({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[traspaso]', error);
    }, [error]);

    return (
        <div className="mx-auto flex max-w-[560px] flex-col items-start gap-5 px-6 py-24 sm:px-12">
            <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--color-error)]">
                ALGO SE ROMPIÓ
            </span>
            <h1 className="text-[28px] font-bold tracking-[-0.02em]">
                No pudimos cargar esta pantalla
            </h1>
            <p className="text-[15px] leading-relaxed text-[var(--color-tenue)]">
                Fue un problema nuestro, no tuyo. Ninguna operación quedó a medias: nada se
                guarda hasta que la pantalla confirma que salió bien.
            </p>
            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={reset}
                    className="rounded-[var(--radius-chico)] bg-[var(--color-acento)] px-4 py-2 text-[14px] font-bold text-[var(--color-fondo)]"
                >
                    Reintentar
                </button>
                <a
                    href="/"
                    className="rounded-[var(--radius-chico)] border border-[var(--color-borde-fuerte)] px-4 py-2 text-[14px] text-[var(--color-tenue)] transition-colors hover:text-[var(--color-tinta)]"
                >
                    Volver al inicio
                </a>
            </div>
            {error.digest && (
                <p className="font-mono text-[12px] text-[var(--color-apagado)]">
                    Referencia: {error.digest}
                </p>
            )}
        </div>
    );
}
