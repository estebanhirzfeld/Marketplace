import { NextResponse } from 'next/server';
import { ApiError } from '@marketplace/api-client';
import type { VerificationSourceDto } from '@marketplace/api-contract';
import { api } from '@/lib/api';

/**
 * Vuelta del consentimiento de Google.
 *
 * Google manda acá con un código de un solo uso y con el `state` que le dimos,
 * que lleva la fuente y el listing. El código se pasa a la API, que lo canja,
 * hace una llamada y lo descarta: en ningún momento se guarda un token.
 *
 * Esta ruta no muestra nada: resuelve y redirige, con el resultado en la barra
 * de direcciones para que la pantalla del vendedor pueda contarlo.
 */
export async function GET(request: Request): Promise<NextResponse> {
    const params = new URL(request.url).searchParams;

    const code = params.get('code');
    const state = params.get('state') ?? '';
    const [source, listingId] = state.split(':');

    // El vendedor puede cancelar en la pantalla de Google.
    if (params.get('error') || !code) {
        return redirigir(listingId, 'cancelada');
    }
    if (!listingId || (source !== 'youtube' && source !== 'adsense')) {
        return redirigir(undefined, 'invalida');
    }

    try {
        await api().verifyOwnership(listingId, source as VerificationSourceDto, code);
    } catch (e) {
        // El motivo real lo explica la API; acá solo se distingue el rechazo
        // esperable —no controla el activo— de una falla cualquiera.
        const rechazo = e instanceof ApiError && e.code === 'FORBIDDEN';
        return redirigir(listingId, rechazo ? 'sin-control' : 'error');
    }

    return redirigir(listingId, 'ok');
}

function redirigir(listingId: string | undefined, resultado: string): NextResponse {
    const destino = new URL('/activos', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000');
    destino.searchParams.set('verificacion', resultado);
    if (listingId) destino.searchParams.set('listing', listingId);

    return NextResponse.redirect(destino);
}
