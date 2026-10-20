import { createHmac } from 'node:crypto';
import { IOwnershipChallengeIssuer } from '@marketplace/domain/src/ports/IOwnershipReaders';

const PREFIX = 'traspaso-verificacion=';
const HEX_LENGTH = 24;
const MIN_SECRET_LENGTH = 32;

/**
 * Deriva el valor del registro TXT con HMAC-SHA256 del par `listing:dominio`.
 *
 * Al ser una función pura del secreto y del par, no hace falta guardarlo: el
 * vendedor puede pedirlo las veces que quiera y siempre recibe el mismo. Sin el
 * secreto nadie puede calcular el valor de un listing ajeno, y el valor de un
 * sitio no sirve para otro. 24 caracteres hexadecimales son 96 bits.
 */
export class HmacOwnershipChallengeIssuer implements IOwnershipChallengeIssuer {
    constructor(private readonly secret: string) {
        if (secret.trim().length < MIN_SECRET_LENGTH) {
            throw new Error(
                `El secreto del desafío de DNS debe tener al menos ${MIN_SECRET_LENGTH} caracteres. ` +
                    'Generalo con: openssl rand -hex 32',
            );
        }
    }

    tokenFor(listingId: string, domain: string): string {
        const digest = createHmac('sha256', this.secret).update(`${listingId}:${domain}`).digest('hex');
        return `${PREFIX}${digest.slice(0, HEX_LENGTH)}`;
    }
}
