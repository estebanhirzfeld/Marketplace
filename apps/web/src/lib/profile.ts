import { cache } from 'react';
import type { MyProfileDto } from '@marketplace/api-contract';
import { api } from './api';
import { currentActor } from './session';

/**
 * El perfil se lee de la API y no de la cookie.
 *
 * `isKycVerified` cambia sin que cambie el token: si lo cacheáramos en la
 * sesión, alguien que acaba de verificarse seguiría viendo el aviso hasta
 * volver a entrar.
 *
 * `cache` de React memoiza por request, así que los dos componentes del layout
 * que necesitan el perfil —la barra, para el nombre, y el aviso de
 * verificación— comparten una sola llamada a la API en vez de pedirlo dos veces
 * en cada página. El alcance es el request: nada se comparte entre usuarios.
 */
export const currentProfile = cache(async function currentProfile(): Promise<MyProfileDto | null> {
    if (!(await currentActor())) return null;

    try {
        return await api().perfil();
    } catch {
        return null;
    }
});
