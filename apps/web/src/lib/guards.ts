import { redirect } from 'next/navigation';
import type { ActorDto } from '@marketplace/api-contract';
import { UserRole } from '@marketplace/shared-types';
import { currentActor } from './session';

/**
 * Guardas de ruta.
 *
 * Sacar un enlace de la barra de navegación quita el descubrimiento, no el
 * acceso: la ruta seguía respondiendo a quien escribiera la dirección a mano.
 * Estas funciones son las que efectivamente cierran la puerta, y por eso viven
 * en un solo lugar en vez de repetirse en cada pantalla.
 *
 * No reemplazan al dominio: la API valida igual. Redirigir es para no mostrar
 * una pantalla que solo va a devolver errores.
 */

/** Exige sesión. Devuelve el actor para no volver a leerlo. */
export async function requireSession(): Promise<ActorDto> {
    const actor = await currentActor();
    if (!actor) redirect('/ingresar');
    return actor;
}

/**
 * Exige sesión y que no sea la plataforma.
 *
 * Vender, tener operaciones propias y abrir reclamos son cosas de las partes de
 * una compraventa. El admin las verifica, no participa de ellas, así que va a
 * su propio panel.
 */
export async function requireCounterparty(): Promise<ActorDto> {
    const actor = await requireSession();
    if (actor.role === UserRole.ADMIN) redirect('/admin');
    return actor;
}

/** Exige que sea la plataforma. */
export async function requireAdmin(): Promise<ActorDto> {
    const actor = await requireSession();
    if (actor.role !== UserRole.ADMIN) redirect('/');
    return actor;
}
