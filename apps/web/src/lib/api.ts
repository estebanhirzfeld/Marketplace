import { MarketplaceClient } from '@marketplace/api-client';
import { readSession } from './session';

const BASE = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Cliente de la API atado a la sesión del request.
 *
 * El mismo MarketplaceClient que va a usar la app móvil: allá el token sale
 * de secure storage, acá de una cookie httpOnly. El contrato no cambia.
 */
export function api(): MarketplaceClient {
    return new MarketplaceClient({
        baseUrl: BASE,
        getToken: async () => (await readSession())?.token,
    });
}

/** Para rutas públicas donde no queremos arrastrar la sesión. */
export function anonymousApi(): MarketplaceClient {
    return new MarketplaceClient({ baseUrl: BASE });
}
