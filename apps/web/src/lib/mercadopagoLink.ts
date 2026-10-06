import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Los valores de un intento de vincular Mercado Pago.
 *
 * - `state`: ata la vuelta de Mercado Pago a este navegador. Sin comprobarlo,
 *   alguien podría mandarle a la víctima un enlace con SU código y dejar la
 *   cuenta de la víctima vinculada a la cuenta del atacante (CSRF de login).
 * - `verifier` y `challenge`: PKCE S256. El desafío viaja en la dirección de
 *   autorización; el verificador se queda en la cookie y recién se revela al
 *   canjear el código, así que un código interceptado no sirve solo.
 */
export interface LinkAttempt {
    state: string;
    verifier: string;
    challenge: string;
}

export function createLinkAttempt(): LinkAttempt {
    const state = randomBytes(16).toString('hex');
    // 32 bytes en base64url son 43 caracteres: el mínimo que acepta RFC 7636.
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    return { state, verifier, challenge };
}

/**
 * Compara dos `state` en tiempo constante.
 *
 * `timingSafeEqual` exige el mismo largo y lanza si no lo tiene, así que el
 * largo se compara antes. Que el largo se filtre no importa: es público (32).
 * Un valor vacío o ausente nunca coincide: una cookie perdida no puede dar por
 * buena una vuelta sin `state`.
 */
export function statesMatch(a: string | undefined | null, b: string | undefined | null): boolean {
    if (!a || !b) return false;

    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;

    return timingSafeEqual(left, right);
}

/** Nombre de la cookie que guarda `{ state, verifier }` entre la ida y la vuelta. */
export const LINK_COOKIE = 'traspaso_mp_link';

/**
 * - `lax`: la vuelta de Mercado Pago es una navegación de nivel superior desde
 *   otro sitio; con `strict` el navegador no mandaría la cookie.
 * - `path`: solo el callback la necesita.
 * - `maxAge`: los 10 minutos que dura el código de autorización.
 */
export const LINK_COOKIE_OPTIONS = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/mercadopago',
    maxAge: 600,
} as const;

export function serializeLinkCookie(attempt: Pick<LinkAttempt, 'state' | 'verifier'>): string {
    return JSON.stringify({ state: attempt.state, verifier: attempt.verifier });
}

/** Una cookie ausente, corrupta o de otra forma se trata como sin intento. */
export function parseLinkCookie(raw: string | undefined): { state: string; verifier: string } | null {
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        return typeof parsed?.state === 'string' && typeof parsed?.verifier === 'string'
            ? { state: parsed.state, verifier: parsed.verifier }
            : null;
    } catch {
        return null;
    }
}

/** Resultado de la vinculación, tal como viaja en `?mercadopago=`. */
export type LinkResult = 'vinculada' | 'error' | 'no-disponible';

export function parseLinkResult(value: string | undefined): LinkResult | undefined {
    return value === 'vinculada' || value === 'error' || value === 'no-disponible'
        ? value
        : undefined;
}
