import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ApiError } from '@marketplace/api-client';
import type { VerificationSourceDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';
import { readSession } from '@/lib/session';
import { publicBaseUrl, statesMatch } from '@/lib/mercadopagoLink';
import { YOUTUBE_STATE_COOKIE, classifyConnectionError } from '@/lib/youtubeConnection';

/**
 * Vuelta del consentimiento de Google.
 *
 * La misma dirección registrada en Google sirve a dos flujos, y el `state` dice
 * cuál es:
 *
 * - **Conexión del vendedor**: el `state` es aleatorio y coincide con el de una
 *   cookie httpOnly. Se comprueba ANTES de tocar la API: es la defensa contra
 *   que alguien nos mande a la víctima con un código ajeno y deje un canal
 *   ajeno conectado a su cuenta. La cookie se borra en todos los caminos.
 * - **Titularidad de un activo**: el `state` es `fuente:listingId`. No lleva
 *   cookie y vuelve al activo del que salió.
 *
 * El código se pasa a la API, que lo canjea; en ningún momento se registra ni
 * el código ni el `state`. Esta ruta no muestra nada: resuelve y redirige, con
 * el resultado en la dirección para que la pantalla pueda contarlo.
 */
export async function GET(request: Request): Promise<NextResponse> {
    const params = new URL(request.url).searchParams;

    const store = await cookies();
    const attemptState = store.get(YOUTUBE_STATE_COOKIE)?.value;
    store.delete({ name: YOUTUBE_STATE_COOKIE, path: '/api/youtube' });

    const state = params.get('state') ?? '';
    const code = params.get('code');

    // Los `state` de titularidad llevan dos puntos y los de conexión nunca.
    if (state.includes(':')) {
        return verifyOwnership(request, state, code, params.get('error'));
    }

    if (!statesMatch(state, attemptState)) {
        return redirectTo(request, '/vender?conexion=invalida');
    }

    if (!(await readSession())) return redirectTo(request, '/ingresar');

    // El vendedor puede cancelar en la pantalla de Google.
    if (params.get('error') || !code) {
        return redirectTo(request, '/vender?conexion=cancelada');
    }

    try {
        const channel = await api().connectYouTubeChannel({ code });
        return redirectTo(request, `/vender?${new URLSearchParams({ canal: channel.channelId })}`);
    } catch (e) {
        const { reason, detail } = classifyConnectionError(e);
        const query = new URLSearchParams({ conexion: reason });
        if (detail) query.set('detalle', detail);
        return redirectTo(request, `/vender?${query}`);
    }
}

/** Verificación de titularidad: vuelve al activo, en su pestaña de verificaciones. */
async function verifyOwnership(
    request: Request,
    state: string,
    code: string | null,
    error: string | null,
): Promise<NextResponse> {
    const [source, listingId] = state.split(':');

    // El vendedor puede cancelar en la pantalla de Google.
    if (error || !code) {
        return backToListing(request, listingId, 'cancelada');
    }
    if (!listingId || (source !== 'youtube' && source !== 'adsense')) {
        return backToListing(request, undefined, 'invalida');
    }

    try {
        await api().verifyOwnership(listingId, source as VerificationSourceDto, code);
    } catch (e) {
        // El motivo real lo explica la API; acá solo se distingue el rechazo
        // esperable —no controla el activo— de una falla cualquiera.
        const rejected = e instanceof ApiError && e.code === 'FORBIDDEN';
        return backToListing(request, listingId, rejected ? 'sin-control' : 'error');
    }

    return backToListing(request, listingId, 'ok');
}

/**
 * Al activo cuando se sabe cuál era; si no, al listado. Volver al listado a
 * secas obligaba al vendedor a buscar el activo que estaba verificando.
 */
function backToListing(request: Request, listingId: string | undefined, result: string): NextResponse {
    if (!listingId) return redirectTo(request, `/activos?${new URLSearchParams({ verificacion: result })}`);

    const query = new URLSearchParams({ ver: 'verificaciones', verificacion: result });
    return redirectTo(request, `/activos/${encodeURIComponent(listingId)}?${query}`);
}

function redirectTo(request: Request, path: string): NextResponse {
    return NextResponse.redirect(new URL(path, publicBaseUrl(request, process.env.NEXT_PUBLIC_APP_URL)));
}
