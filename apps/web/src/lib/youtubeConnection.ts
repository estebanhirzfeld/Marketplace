import { randomBytes } from 'node:crypto';
import { ApiError } from '@marketplace/api-client';

/**
 * La conexión del vendedor con su canal de YouTube: lo que viaja entre
 * `/vender`, Google y el callback.
 *
 * El `state` ata la vuelta de Google a este navegador, con el mismo patrón que
 * Mercado Pago: sin comprobarlo, alguien podría mandarle a la víctima un
 * enlace con SU código y dejar el canal del atacante conectado a la cuenta de
 * la víctima. No lleva verificador PKCE porque el cliente de Google de la API
 * no lo usa.
 */

/** Nombre de la cookie que guarda el `state` entre la ida y la vuelta. */
export const YOUTUBE_STATE_COOKIE = 'traspaso_yt_connect';

/**
 * - `path`: el del callback, que es la única ruta que la lee.
 * - `lax`: la vuelta de Google es una navegación de nivel superior desde otro
 *   sitio; con `strict` el navegador no mandaría la cookie.
 */
export const YOUTUBE_STATE_COOKIE_OPTIONS = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/youtube',
    maxAge: 600,
} as const;

/**
 * Hexadecimal y sin dos puntos, a propósito: el callback distingue la
 * verificación de titularidad (`fuente:listingId`) de la conexión por ese
 * carácter, así que un `state` de conexión nunca puede confundirse con uno viejo.
 */
export function createConnectionState(): string {
    return randomBytes(16).toString('hex');
}

/** Por qué no se pudo conectar el canal, tal como viaja en `?conexion=`. */
export type ConnectionReason = 'cancelada' | 'permisos' | 'sin-canal' | 'no-disponible' | 'invalida';

const REASONS: readonly ConnectionReason[] = ['cancelada', 'permisos', 'sin-canal', 'no-disponible', 'invalida'];

export function parseConnectionReason(value: string | undefined): ConnectionReason | undefined {
    return REASONS.find((r) => r === value);
}

export interface ConnectionFailure {
    reason: ConnectionReason;
    /** Solo con `permisos`: el mensaje de la API, que nombra lo que falta. */
    detail?: string;
}

export interface ConnectionFailureText {
    text: string;
    actionLabel: string;
}

/**
 * El mensaje de la API cuando faltan permisos. La dirección de `/vender` la
 * puede armar cualquiera, así que un texto que llega por ahí solo se muestra
 * si tiene exactamente esta forma: si no, se usa uno general. Evita que un
 * enlace armado a mano ponga frases ajenas con la voz de la plataforma.
 */
const MISSING_PERMISSIONS_MESSAGE =
    /^Para publicar tu canal necesitamos que nos dejes [A-Za-zÁÉÍÓÚáéíóúñ ,]{1,200}\. Volvé a conectar y dejá todos los permisos tildados: solo leemos, no podemos publicar ni borrar nada\.$/;

const GENERAL_PERMISSIONS_TEXT =
    'Faltan permisos para leer tu canal. Volvé a conectar y dejá todos los permisos tildados: solo leemos, no podemos publicar ni borrar nada.';

export function describeConnectionFailure(reason: ConnectionReason, detail?: string): ConnectionFailureText {
    switch (reason) {
        case 'cancelada':
            return {
                text: 'No conectaste el canal. Sin conexión no se puede publicar.',
                actionLabel: 'Intentar de nuevo',
            };
        case 'permisos':
            return {
                text: detail && MISSING_PERMISSIONS_MESSAGE.test(detail) ? detail : GENERAL_PERMISSIONS_TEXT,
                actionLabel: 'Conectar de nuevo',
            };
        case 'sin-canal':
            return {
                text: 'Esa cuenta de Google no tiene un canal. Si tu canal está en una cuenta de marca, elegila en la pantalla de Google.',
                actionLabel: 'Conectar de nuevo',
            };
        case 'no-disponible':
            return {
                text: 'No pudimos leer tu canal. No se guardó nada; probá de nuevo en unos minutos.',
                actionLabel: 'Intentar de nuevo',
            };
        case 'invalida':
            return {
                text: 'La conexión no se pudo validar. Probá de nuevo.',
                actionLabel: 'Intentar de nuevo',
            };
    }
}

/**
 * Traduce el error de conectar a un motivo.
 *
 * La API responde 400 para tres cosas distintas sin un código propio para cada
 * una, así que se reconocen por el mensaje (igual que el aviso de Mercado
 * Pago en `vender/actions.ts`). Lo que no se reconoce es `invalida`: un código
 * vencido o ya usado. Todo lo que no es una respuesta de la API (red caída) es
 * `no-disponible`, porque tampoco es culpa del vendedor.
 */
export function classifyConnectionError(error: unknown): ConnectionFailure {
    if (!(error instanceof ApiError)) return { reason: 'no-disponible' };

    if (error.status === 503) return { reason: 'no-disponible' };
    if (/no tiene un canal/.test(error.message)) return { reason: 'sin-canal' };
    if (/^Para publicar tu canal necesitamos/.test(error.message)) {
        return { reason: 'permisos', detail: error.message };
    }
    if (/Volvé a conectar|aceptá todos los permisos/.test(error.message)) return { reason: 'permisos' };

    return { reason: 'invalida' };
}

/**
 * Qué hacer cuando falla la lectura de los canales conectados.
 *
 * La API responde 503 mientras no están las credenciales de Google: es la única
 * condición en la que existe la carga manual (`null`). Cualquier otra falla se
 * trata como "ninguno todavía": volver a conectar un canal ya conectado lo
 * reutiliza, así que no se pierde nada.
 */
export function connectionsFromReadError(error: unknown): null | never[] {
    return error instanceof ApiError && error.status === 503 ? null : [];
}

export type SellView<C> =
    | { kind: 'web' }
    | { kind: 'manual' }
    | { kind: 'selected'; channel: C }
    | { kind: 'list'; channels: C[] };

/**
 * Qué pantalla de `/vender` corresponde.
 *
 * - `web`: el sitio no pasa por la conexión con YouTube.
 * - `manual`: la integración no está configurada.
 * - `selected`: un canal elegido con `?canal`, o el único que hay mientras no
 *   venga de un error de conexión (un error tiene que verse en la lista).
 * - `list`: elegir uno o conectar el primero; un `?canal` desconocido cae acá.
 */
export function chooseSellView<C extends { channelId: string }>(input: {
    connections: C[] | null;
    canal: string | undefined;
    failed: boolean;
    web: boolean;
    notConfigured?: boolean;
}): SellView<C> {
    if (input.web) return { kind: 'web' };
    if (input.connections === null || input.notConfigured) return { kind: 'manual' };

    const channels = input.connections;
    const selected =
        channels.find((c) => c.channelId === input.canal) ??
        (channels.length === 1 && !input.failed ? channels[0] : undefined);

    return selected ? { kind: 'selected', channel: selected } : { kind: 'list', channels };
}
