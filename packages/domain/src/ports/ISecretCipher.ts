/**
 * Puerto de cifrado de secretos en reposo.
 *
 * El algoritmo y la clave son decisiones de infraestructura y su
 * implementación vive en apps/api. El dominio solo declara qué necesita:
 * convertir un secreto en un texto opaco que se pueda guardar y recuperarlo.
 *
 * `decrypt` debe lanzar ante un texto alterado, de otra versión o cifrado con
 * otra clave; nunca devolver basura.
 */
export interface ISecretCipher {
    encrypt(plain: string): string;
    decrypt(payload: string): string;
}
