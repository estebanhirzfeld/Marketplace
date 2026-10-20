import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ISecretCipher } from '@marketplace/domain/src/ports/ISecretCipher';

const PREFIJO = 'v1:';
const LARGO_CLAVE = 32;
const LARGO_IV = 12;
const LARGO_ETIQUETA = 16;

/**
 * Cifrado de secretos en reposo con AES-256-GCM.
 *
 * Formato: `v1:` + base64(iv ‖ etiqueta ‖ texto cifrado). El IV es aleatorio
 * en cada cifrado, así que el mismo texto nunca da el mismo resultado. El
 * prefijo de versión deja cambiar el formato más adelante sin ambigüedad.
 *
 * Perder la clave es irrecuperable: los tokens guardados no se pueden leer y
 * los vendedores tienen que vincular su cuenta de nuevo.
 */
export class AesGcmSecretCipher implements ISecretCipher {
    private readonly key: Buffer;

    /** @param base64Key clave de 32 bytes codificada en base64. */
    constructor(base64Key: string) {
        const key = Buffer.from(base64Key ?? '', 'base64');
        if (key.length !== LARGO_CLAVE) {
            // Ni la clave ni su largo exacto salen en el mensaje.
            throw new Error(
                'La clave de cifrado debe decodificar a exactamente 32 bytes en base64. ' +
                    'Generala con: openssl rand -base64 32',
            );
        }
        this.key = key;
    }

    encrypt(plain: string): string {
        const iv = randomBytes(LARGO_IV);
        const cipher = createCipheriv('aes-256-gcm', this.key, iv);
        const cifrado = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
        const etiqueta = cipher.getAuthTag();

        return PREFIJO + Buffer.concat([iv, etiqueta, cifrado]).toString('base64');
    }

    decrypt(payload: string): string {
        if (typeof payload !== 'string' || !payload.startsWith(PREFIJO)) {
            throw new Error('El secreto cifrado tiene una versión de formato desconocida.');
        }

        const bytes = Buffer.from(payload.slice(PREFIJO.length), 'base64');
        if (bytes.length < LARGO_IV + LARGO_ETIQUETA) {
            throw new Error('No se pudo descifrar el secreto: el contenido está incompleto.');
        }

        const iv = bytes.subarray(0, LARGO_IV);
        const etiqueta = bytes.subarray(LARGO_IV, LARGO_IV + LARGO_ETIQUETA);
        const cifrado = bytes.subarray(LARGO_IV + LARGO_ETIQUETA);

        try {
            const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
            decipher.setAuthTag(etiqueta);
            return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString('utf8');
        } catch {
            // GCM autentica: una clave equivocada o un contenido alterado
            // fallan acá, nunca devuelven texto basura.
            throw new Error('No se pudo descifrar el secreto: clave incorrecta o contenido alterado.');
        }
    }
}
