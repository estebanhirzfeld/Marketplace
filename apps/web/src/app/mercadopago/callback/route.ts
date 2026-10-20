import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { readSession } from '@/lib/session';
import {
    LINK_COOKIE,
    LINK_COOKIE_OPTIONS,
    parseLinkCookie,
    publicBaseUrl,
    statesMatch,
} from '@/lib/mercadopagoLink';

/**
 * Vuelta de Mercado Pago tras autorizar la cuenta del vendedor.
 *
 * La dirección registrada en Mercado Pago es exactamente
 * `<app>/mercadopago/callback`. Llega con un código de un solo uso y con el
 * `state` que generamos al salir; el verificador PKCE y ese mismo `state`
 * esperan en una cookie httpOnly.
 *
 * Reglas que no se saltean:
 * - La cookie se borra en todos los caminos: es de un solo intento y un
 *   verificador reutilizable no sirve para nada bueno.
 * - El `state` de la dirección se compara con el de la cookie ANTES de tocar la
 *   API. Es la defensa contra que alguien nos mande a la víctima con un código
 *   ajeno y deje su cuenta vinculada a la del atacante.
 * - Ni el código, ni el `state`, ni el verificador se registran en ningún log.
 *
 * Esta ruta no muestra nada: resuelve y redirige, con el resultado en la
 * dirección para que el perfil pueda contarlo.
 */
export async function GET(request: Request): Promise<NextResponse> {
    const params = new URL(request.url).searchParams;

    const store = await cookies();
    const attempt = parseLinkCookie(store.get(LINK_COOKIE)?.value);
    store.delete({ name: LINK_COOKIE, path: LINK_COOKIE_OPTIONS.path });

    if (!(await readSession())) return redirectTo(request, '/ingresar');

    const code = params.get('code');

    // La persona puede cancelar en la pantalla de Mercado Pago: llega `error`
    // en vez de `code`. Sin intento propio tampoco hay nada que canjear.
    if (params.get('error') || !code || !attempt) {
        return redirectTo(request, '/perfil?mercadopago=error');
    }

    if (!statesMatch(params.get('state'), attempt.state)) {
        return redirectTo(request, '/perfil?mercadopago=error');
    }

    try {
        await api().linkMercadoPago({ code, codeVerifier: attempt.verifier });
    } catch {
        // El motivo lo explica la API; a la persona solo le sirve saber que
        // tiene que probar de nuevo.
        return redirectTo(request, '/perfil?mercadopago=error');
    }

    return redirectTo(request, '/perfil?mercadopago=vinculada');
}

function redirectTo(request: Request, path: string): NextResponse {
    return NextResponse.redirect(new URL(path, publicBaseUrl(request, process.env.NEXT_PUBLIC_APP_URL)));
}

