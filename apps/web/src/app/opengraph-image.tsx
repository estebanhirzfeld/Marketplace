import { ImageResponse } from 'next/og';

export const alt = 'Traspaso: compraventa de activos digitales con custodia';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Los mismos valores de `globals.css`: `ImageResponse` no lee variables CSS.
const FONDO = '#0b0c0e';
const SUPERFICIE = '#141619';
const BORDE = '#2a2e35';
const TINTA = '#e8e9ea';
const TENUE = '#8c939c';
const ACENTO = '#cff245';

/**
 * Imagen que se ve al compartir el enlace de la portada.
 *
 * Usa la fuente por defecto de `ImageResponse` a propósito: bajar una tipografía
 * en cada render sumaría una dependencia de red a algo que debe salir siempre.
 */
export default function Image() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    padding: '0 96px',
                    background: FONDO,
                    color: TINTA,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div
                        style={{
                            width: 120,
                            height: 120,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: SUPERFICIE,
                            border: `2px solid ${BORDE}`,
                            borderRadius: 24,
                        }}
                    >
                        <svg width="72" height="72" viewBox="0 0 24 24">
                            <path
                                d="M4 18l6-7 4 4 6-9"
                                fill="none"
                                stroke={ACENTO}
                                strokeWidth="2.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </div>
                    <div style={{ marginLeft: 36, fontSize: 112, fontWeight: 700, letterSpacing: -2 }}>
                        Traspaso
                    </div>
                </div>
                <div style={{ marginTop: 56, fontSize: 52, fontWeight: 700, lineHeight: 1.2 }}>
                    Compraventa de activos digitales con custodia
                </div>
                <div style={{ marginTop: 28, fontSize: 36, color: TENUE }}>
                    Canales de YouTube y sitios web
                </div>
                <div
                    style={{
                        marginTop: 56,
                        width: 160,
                        height: 6,
                        borderRadius: 3,
                        background: ACENTO,
                    }}
                />
            </div>
        ),
        { ...size },
    );
}
