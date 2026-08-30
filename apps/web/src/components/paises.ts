/**
 * Países de audiencia, con el código que espera el dominio.
 *
 * `YouTubeStrategy` usa este código para ajustar el múltiplo de valuación:
 * una audiencia de CPM alto vale más que una de CPM bajo. Ojo con el Reino
 * Unido — la estrategia lo espera como `UK` y no como el `GB` de la norma ISO,
 * así que cambiar este valor le baja el múltiplo a esos canales sin que nada
 * lo advierta.
 *
 * La lista es corta a propósito: son los mercados donde este marketplace tiene
 * sentido hoy. Un desplegable de doscientos países no ayuda a nadie a elegir.
 */
export interface Pais {
    codigo: string;
    nombre: string;
}

/** CPM alto: la estrategia les da un múltiplo mayor. */
export const PAISES_CPM_ALTO: Pais[] = [
    { codigo: 'US', nombre: 'Estados Unidos' },
    { codigo: 'UK', nombre: 'Reino Unido' },
    { codigo: 'CA', nombre: 'Canadá' },
    { codigo: 'AU', nombre: 'Australia' },
    { codigo: 'DE', nombre: 'Alemania' },
    { codigo: 'NL', nombre: 'Países Bajos' },
];

export const PAISES_RESTO: Pais[] = [
    { codigo: 'AR', nombre: 'Argentina' },
    { codigo: 'MX', nombre: 'México' },
    { codigo: 'ES', nombre: 'España' },
    { codigo: 'CO', nombre: 'Colombia' },
    { codigo: 'CL', nombre: 'Chile' },
    { codigo: 'PE', nombre: 'Perú' },
    { codigo: 'UY', nombre: 'Uruguay' },
    { codigo: 'BR', nombre: 'Brasil' },
    { codigo: 'FR', nombre: 'Francia' },
    { codigo: 'IT', nombre: 'Italia' },
];

export const PAISES: Pais[] = [...PAISES_CPM_ALTO, ...PAISES_RESTO];

const NOMBRES = new Map(PAISES.map((p) => [p.codigo, p.nombre]));

/** El código tal cual si el país no está en la lista: mejor eso que un vacío. */
export function nombreDePais(codigo: string): string {
    return NOMBRES.get(codigo) ?? codigo;
}
