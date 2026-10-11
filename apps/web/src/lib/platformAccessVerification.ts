import { randomBytes } from 'node:crypto';

/**
 * La verificación del acceso de la plataforma con la cuenta de custodia: lo
 * que viaja entre `/admin`, Google y el callback.
 *
 * Comparte la dirección registrada en Google con la conexión del vendedor y la
 * verificación de titularidad, y se distingue por el `state`:
 * `acceso:<activo>:<azar>`. El azar va también en una cookie httpOnly del
 * navegador del admin; el callback exige que coincidan antes de llamar a la API
 * (defensa contra que alguien nos mande al admin con un código ajeno).
 */

/** Nombre de la cookie que guarda el `state` entre la ida y la vuelta. */
export const ACCESS_STATE_COOKIE = 'traspaso_acceso_verif';

const PREFIX = 'acceso:';

/** Mismas opciones que la cookie de la conexión: el callback es la única ruta que la lee. */
export const ACCESS_STATE_COOKIE_OPTIONS = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/youtube',
    maxAge: 600,
} as const;

export function createAccessVerificationState(listingId: string): string {
    return `${PREFIX}${listingId}:${randomBytes(16).toString('hex')}`;
}

export function isAccessVerificationState(state: string): boolean {
    return state.startsWith(PREFIX);
}

/** El activo del que salió la verificación; `undefined` si el `state` no tiene la forma. */
export function listingIdFromAccessState(state: string): string | undefined {
    if (!isAccessVerificationState(state)) return undefined;

    const [listingId, nonce, ...rest] = state.slice(PREFIX.length).split(':');
    if (!listingId || !nonce || rest.length > 0) return undefined;
    return listingId;
}

/** Cómo terminó la verificación, tal como viaja en `?acceso=`. */
export type AccessResult = 'ok' | 'sin-acceso' | 'cancelada' | 'invalida' | 'no-configurado' | 'error';

const RESULTS: readonly AccessResult[] = ['ok', 'sin-acceso', 'cancelada', 'invalida', 'no-configurado', 'error'];

export function parseAccessResult(value: string | undefined): AccessResult | undefined {
    return RESULTS.find((r) => r === value);
}

export interface AccessResultAlert {
    tone: 'ok' | 'warning' | 'error';
    text: string;
}

/** El aviso del panel. `detail` es el mensaje de la API, solo para `error`. */
export function accessResultAlert(result: AccessResult, detail?: string): AccessResultAlert {
    switch (result) {
        case 'ok':
            return { tone: 'ok', text: 'Acceso verificado: la cuenta de custodia administra el canal y quedó registrado.' };
        case 'sin-acceso':
            return {
                tone: 'error',
                text:
                    'La cuenta elegida no administra este canal. Ingresá con la cuenta de custodia y elegí la ' +
                    'Cuenta de Marca del canal; si el vendedor todavía no nos invitó, esperá la invitación.',
            };
        case 'cancelada':
            return { tone: 'warning', text: 'Cancelaste el ingreso con Google. No se registró nada.' };
        case 'invalida':
            return { tone: 'error', text: 'La vuelta de Google no corresponde a esta sesión. Volvé a empezar la verificación.' };
        case 'no-configurado':
            return { tone: 'error', text: 'La verificación con Google todavía no está configurada. Podés registrar el acceso a mano.' };
        case 'error':
            return { tone: 'error', text: detail ?? 'No pudimos verificar el acceso. Probá de nuevo o registralo a mano.' };
    }
}
