'use client';

import { useEffect } from 'react';
import './globals.css';

/**
 * La red de contención del layout.
 *
 * `error.tsx` no la cubre: envuelve a las pantallas, no al layout que las
 * contiene. Y en el layout vive la barra de navegación, con el botón de salir
 * —una Server Action— y la campana de avisos. Si algo falla ahí, Next mostraba
 * su pantalla cruda de error, en inglés, con el stack a la vista.
 *
 * Pasó de verdad: un fallo al invocar la acción de salir dejó al usuario
 * mirando "An unexpected response was received from the server" sobre el
 * código fuente del navbar.
 *
 * Reemplaza al layout entero, así que tiene que traer sus propias etiquetas
 * `html` y `body`, y su propia hoja de estilos: nada de lo de arriba está
 * montado cuando esto aparece. Por eso repite el aspecto de `error.tsx` en vez
 * de reutilizarlo — no hay layout que le dé tipografías ni variables.
 *
 * En esta versión de Next el reintento se llama `unstable_retry`, no `reset`.
 */
export default function ErrorDeLaAplicacion({
    error,
    unstable_retry,
}: {
    error: Error & { digest?: string };
    unstable_retry: () => void;
}) {
    useEffect(() => {
        console.error('[traspaso]', error);
    }, [error]);

    return (
        <html lang="es">
            <body
                style={{
                    // Sin layout no hay variables de tema cargadas, así que los
                    // colores van explícitos: una pantalla de error que se ve
                    // rota es peor que el error.
                    background: '#0b0d0e',
                    color: '#e8eaed',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    margin: 0,
                    minHeight: '100vh',
                }}
            >
                <div
                    style={{
                        margin: '0 auto',
                        maxWidth: 560,
                        padding: '96px 24px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: 20,
                    }}
                >
                    <span style={{ fontSize: 11, letterSpacing: '0.08em', color: '#ff6b6b' }}>
                        ALGO SE ROMPIÓ
                    </span>
                    <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
                        No pudimos cargar la aplicación
                    </h1>
                    <p style={{ fontSize: 15, lineHeight: 1.6, color: '#9aa0a6', margin: 0 }}>
                        Fue un problema nuestro, no tuyo. Ninguna operación quedó a medias: nada
                        se guarda hasta que la pantalla confirma que salió bien.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                        <button
                            type="button"
                            onClick={() => unstable_retry()}
                            style={{
                                background: '#d4f34a',
                                color: '#0b0d0e',
                                border: 0,
                                borderRadius: 6,
                                padding: '8px 16px',
                                fontSize: 14,
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            Reintentar
                        </button>
                        <a
                            href="/"
                            style={{
                                border: '1px solid #2a2f33',
                                borderRadius: 6,
                                padding: '8px 16px',
                                fontSize: 14,
                                color: '#9aa0a6',
                                textDecoration: 'none',
                            }}
                        >
                            Volver al inicio
                        </a>
                    </div>
                    {error.digest && (
                        <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
                            Referencia: {error.digest}
                        </p>
                    )}
                </div>
            </body>
        </html>
    );
}
