/**
 * Dónde se guardan los archivos que suben las partes (los comprobantes de
 * una transferencia). Disco en local y en tests; Cloudflare R2 en producción.
 * La clave la arma quien guarda; el almacenamiento no la interpreta.
 */
export interface IFileStorage {
    put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
    /** `null` si no hay un archivo con esa clave. */
    get(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
}
