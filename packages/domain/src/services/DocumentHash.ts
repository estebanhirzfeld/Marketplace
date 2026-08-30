/**
 * Huella del documento firmado.
 *
 * Usa `crypto.subtle` de la Web Crypto API, que está en Node, en el navegador
 * y en React Native: el dominio no toma una dependencia de Node para esto.
 * Es asíncrono por contrato de la API, y por eso vive en un servicio y no en
 * un método de entidad.
 *
 * Para qué sirve: atar cada firma a un texto concreto. Si el documento
 * cambiara después de firmado, el hash deja de coincidir y la discrepancia es
 * demostrable en vez de silenciosa.
 */
export async function hashDocument(contenido: string): Promise<string> {
    const bytes = new TextEncoder().encode(contenido);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);

    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/** Un SHA-256 en hexadecimal: exactamente 64 caracteres de 0-9 y a-f. */
export function isValidHash(valor: string): boolean {
    return /^[0-9a-f]{64}$/.test(valor.toLowerCase());
}
