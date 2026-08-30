import { cookies } from 'next/headers';
import type { ActorDto } from '@marketplace/api-contract';

const COOKIE = 'traspaso_sesion';

/**
 * La sesión vive en una cookie httpOnly: JavaScript del navegador no puede
 * leerla, así que un XSS no se lleva el token. El costo es que solo el
 * servidor la ve, y por eso todo el fetch pasa por Server Components y
 * Server Actions.
 *
 * En Next 16 `cookies()` es asíncrona — el acceso sincrónico se eliminó.
 */
export async function guardarSesion(token: string, actor: ActorDto): Promise<void> {
    const almacen = await cookies();
    almacen.set(COOKIE, JSON.stringify({ token, actor }), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 8,
    });
}

export async function cerrarSesion(): Promise<void> {
    const almacen = await cookies();
    almacen.delete(COOKIE);
}

export async function leerSesion(): Promise<{ token: string; actor: ActorDto } | null> {
    const almacen = await cookies();
    const crudo = almacen.get(COOKIE)?.value;
    if (!crudo) return null;

    try {
        const s = JSON.parse(crudo);
        return typeof s?.token === 'string' && s?.actor?.id ? s : null;
    } catch {
        // Cookie corrupta o de una versión anterior: se trata como sin sesión.
        return null;
    }
}

export async function actorActual(): Promise<ActorDto | null> {
    return (await leerSesion())?.actor ?? null;
}
