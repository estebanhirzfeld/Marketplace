import type { MyProfileDto } from '@marketplace/api-contract';
import { api } from './api';
import { currentActor } from './session';

/**
 * El perfil se lee de la API y no de la cookie.
 *
 * `isKycVerified` cambia sin que cambie el token: si lo cacheáramos en la
 * sesión, alguien que acaba de verificarse seguiría viendo el aviso hasta
 * volver a entrar.
 */
export async function currentProfile(): Promise<MyProfileDto | null> {
    if (!(await currentActor())) return null;

    try {
        return await api().perfil();
    } catch {
        return null;
    }
}
