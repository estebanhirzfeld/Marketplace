import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@marketplace/api-client';
import { YOUTUBE_STATE_COOKIE } from '@/lib/youtubeConnection';

/**
 * El callback de YouTube sirve a dos flujos con el mismo `redirect_uri`: la
 * conexión del vendedor (state aleatorio atado a una cookie) y la verificación
 * de titularidad de un activo (state `fuente:listingId`). Los tests fijan que
 * la conexión no llame a la API sin un state propio y que cada resultado vuelva
 * a donde la persona puede leerlo.
 */

const STATE = 'a'.repeat(32);
const store = { get: vi.fn(), delete: vi.fn() };
const connectYouTubeChannel = vi.fn();
const verifyOwnership = vi.fn();
const readSession = vi.fn();

vi.mock('next/headers', () => ({ cookies: async () => store }));
vi.mock('@/lib/session', () => ({ readSession: () => readSession() }));
vi.mock('@/lib/api', () => ({ api: () => ({ connectYouTubeChannel, verifyOwnership }) }));

import { GET } from '@/app/api/youtube/callback/route';

function llamar(query: string) {
    return GET(new Request(`http://localhost:3000/api/youtube/callback${query}`));
}

function conCookie(value: string | undefined) {
    store.get.mockImplementation((name: string) =>
        name === YOUTUBE_STATE_COOKIE && value !== undefined ? { name, value } : undefined,
    );
}

function destino(res: Response): string {
    const url = new URL(res.headers.get('location') ?? '');
    return url.pathname + url.search;
}

beforeEach(() => {
    vi.resetAllMocks();
    readSession.mockResolvedValue({ token: 't', actor: { id: 'u1' } });
    conCookie(STATE);
});

describe('callback de YouTube en modo conexión', () => {
    it('con state propio conecta el canal y vuelve a /vender con él elegido', async () => {
        connectYouTubeChannel.mockResolvedValue({ channelId: 'UC123' });

        const res = await llamar(`?code=abc&state=${STATE}`);

        expect(connectYouTubeChannel).toHaveBeenCalledWith({ code: 'abc' });
        expect(destino(res)).toBe('/vender?canal=UC123');
    });

    it('borra la cookie en todos los caminos', async () => {
        connectYouTubeChannel.mockResolvedValue({ channelId: 'UC123' });
        await llamar(`?code=abc&state=${STATE}`);
        expect(store.delete).toHaveBeenCalledWith({ name: YOUTUBE_STATE_COOKIE, path: '/api/youtube' });

        store.delete.mockClear();
        await llamar(`?code=abc&state=${'b'.repeat(32)}`);
        expect(store.delete).toHaveBeenCalledWith({ name: YOUTUBE_STATE_COOKIE, path: '/api/youtube' });
    });

    it('un state que no coincide con la cookie NUNCA llama a la API', async () => {
        const res = await llamar(`?code=abc&state=${'b'.repeat(32)}`);

        expect(connectYouTubeChannel).not.toHaveBeenCalled();
        expect(destino(res)).toBe('/vender?conexion=invalida');
    });

    it('sin cookie (vencida o de otro navegador) NUNCA llama a la API', async () => {
        conCookie(undefined);

        const res = await llamar(`?code=abc&state=${STATE}`);

        expect(connectYouTubeChannel).not.toHaveBeenCalled();
        expect(destino(res)).toBe('/vender?conexion=invalida');
    });

    it('sin state NUNCA llama a la API', async () => {
        const res = await llamar('?code=abc');

        expect(connectYouTubeChannel).not.toHaveBeenCalled();
        expect(destino(res)).toBe('/vender?conexion=invalida');
    });

    it('si canceló en Google vuelve con cancelada', async () => {
        const res = await llamar(`?error=access_denied&state=${STATE}`);

        expect(connectYouTubeChannel).not.toHaveBeenCalled();
        expect(destino(res)).toBe('/vender?conexion=cancelada');
    });

    it('sin sesión manda a ingresar sin llamar a la API', async () => {
        readSession.mockResolvedValue(null);

        const res = await llamar(`?code=abc&state=${STATE}`);

        expect(connectYouTubeChannel).not.toHaveBeenCalled();
        expect(destino(res)).toBe('/ingresar');
    });

    it('permisos faltantes: vuelve con permisos y el mensaje de la API', async () => {
        const mensaje = 'Para publicar tu canal necesitamos que nos dejes ver tu canal. Volvé a conectar.';
        connectYouTubeChannel.mockRejectedValue(new ApiError('VALIDATION', mensaje, 400));

        const res = await llamar(`?code=abc&state=${STATE}`);
        const url = new URL(res.headers.get('location') ?? '');

        expect(url.pathname).toBe('/vender');
        expect(url.searchParams.get('conexion')).toBe('permisos');
        expect(url.searchParams.get('detalle')).toBe(mensaje);
    });

    it('cuenta sin canal: vuelve con sin-canal', async () => {
        connectYouTubeChannel.mockRejectedValue(
            new ApiError('VALIDATION', 'Esa cuenta de Google no tiene un canal. Si tu canal...', 400),
        );

        expect(destino(await llamar(`?code=abc&state=${STATE}`))).toBe('/vender?conexion=sin-canal');
    });

    it('Google no disponible: vuelve con no-disponible', async () => {
        connectYouTubeChannel.mockRejectedValue(new ApiError('SERVICE_UNAVAILABLE', 'x', 503));

        expect(destino(await llamar(`?code=abc&state=${STATE}`))).toBe('/vender?conexion=no-disponible');
    });

    it('código vencido: vuelve con invalida', async () => {
        connectYouTubeChannel.mockRejectedValue(new ApiError('VALIDATION', 'El permiso venció.', 400));

        expect(destino(await llamar(`?code=abc&state=${STATE}`))).toBe('/vender?conexion=invalida');
    });
});

describe('callback de YouTube en modo titularidad', () => {
    beforeEach(() => conCookie(undefined));

    it('verificado: vuelve al activo, en la pestaña de verificaciones', async () => {
        verifyOwnership.mockResolvedValue(undefined);

        const res = await llamar('?code=abc&state=youtube:l1');

        expect(verifyOwnership).toHaveBeenCalledWith('l1', 'youtube', 'abc');
        expect(destino(res)).toBe('/activos/l1?ver=verificaciones&verificacion=ok');
    });

    it('rechazo: vuelve al activo con sin-control', async () => {
        verifyOwnership.mockRejectedValue(new ApiError('FORBIDDEN', 'no', 403));

        expect(destino(await llamar('?code=abc&state=adsense:l1'))).toBe(
            '/activos/l1?ver=verificaciones&verificacion=sin-control',
        );
    });

    it('cancelada: vuelve al activo', async () => {
        expect(destino(await llamar('?error=access_denied&state=youtube:l1'))).toBe(
            '/activos/l1?ver=verificaciones&verificacion=cancelada',
        );
        expect(verifyOwnership).not.toHaveBeenCalled();
    });

    it('sin saber qué activo era (fuente desconocida), no hay adónde volver salvo el listado', async () => {
        expect(destino(await llamar('?code=abc&state=otra:'))).toBe('/activos?verificacion=invalida');
    });
});
