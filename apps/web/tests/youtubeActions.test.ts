import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@marketplace/api-client';
import { YOUTUBE_STATE_COOKIE } from '@/lib/youtubeConnection';

/**
 * Publicar un canal conectado es una sola acción: el vendedor completa lo que
 * Google no sabe y termina parado en el borrador. Los tests fijan adónde va,
 * qué ve cuando el canal ya estaba publicado y que la cookie contra CSRF se
 * escriba recién cuando hay una dirección a la que ir.
 */

const createListingFromYouTubeConnection = vi.fn();
const youTubeAuthorizationUrl = vi.fn();
const createListing = vi.fn();
const cookieSet = vi.fn();
const revalidatePath = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSet }) }));
// Igual que Next, `redirect` corta la ejecución lanzando.
vi.mock('next/navigation', () => ({
    redirect: (url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
    },
}));
vi.mock('@/lib/guards', () => ({ requireCounterparty: async () => ({ id: 'u1' }) }));
vi.mock('@/lib/session', () => ({ currentActor: async () => ({ id: 'u1' }) }));
vi.mock('@/lib/api', () => ({
    api: () => ({ createListingFromYouTubeConnection, youTubeAuthorizationUrl, createListing }),
}));

import { createYouTubeListing, publishListing, startYouTubeConnection } from '@/app/vender/actions';

function form(values: Record<string, string>): FormData {
    const f = new FormData();
    for (const [k, v] of Object.entries(values)) f.set(k, v);
    return f;
}

async function redirigeA(promesa: Promise<unknown>): Promise<string> {
    try {
        await promesa;
    } catch (e) {
        if (e instanceof Error && e.message.startsWith('NEXT_REDIRECT:')) {
            return e.message.slice('NEXT_REDIRECT:'.length);
        }
        throw e;
    }
    throw new Error('no redirigió');
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe('createYouTubeListing', () => {
    const datos = { niche: 'gaming', sinRostro: 'on', precio: '1500.50', moneda: 'USD' };

    it('crea desde la conexión y lleva al activo creado', async () => {
        createListingFromYouTubeConnection.mockResolvedValue({ listingId: 'l9', estimatedPriceCents: 100 });

        const destino = await redirigeA(createYouTubeListing('UC123', {}, form(datos)));

        expect(createListingFromYouTubeConnection).toHaveBeenCalledWith('UC123', {
            niche: 'gaming',
            hasNoFaceContent: true,
            askingPrice: { cents: 150_050, currency: 'USD' },
        });
        expect(destino).toBe('/activos/l9');
        expect(revalidatePath).toHaveBeenCalledWith('/activos');
    });

    it('sin el tilde, el contenido no es sin rostro; y respeta pesos', async () => {
        createListingFromYouTubeConnection.mockResolvedValue({ listingId: 'l9', estimatedPriceCents: 100 });

        await redirigeA(createYouTubeListing('UC123', {}, form({ niche: 'news', precio: '900000', moneda: 'ARS' })));

        expect(createListingFromYouTubeConnection).toHaveBeenCalledWith('UC123', {
            niche: 'news',
            hasNoFaceContent: false,
            askingPrice: { cents: 90_000_000, currency: 'ARS' },
        });
    });

    it('un precio inválido no llega a la API', async () => {
        const estado = await createYouTubeListing('UC123', {}, form({ ...datos, precio: '0' }));

        expect(estado.error).toBe('Ingresá un precio válido.');
        expect(createListingFromYouTubeConnection).not.toHaveBeenCalled();
    });

    it('canal ya publicado por el propio vendedor: mensaje y enlace a ese activo', async () => {
        createListingFromYouTubeConnection.mockRejectedValue(
            new ApiError('INVALID_STATE', 'Ese canal ya está publicado.', 409, 'l5'),
        );

        const estado = await createYouTubeListing('UC123', {}, form(datos));

        expect(estado.error).toBe('Ese canal ya lo publicaste.');
        expect(estado.next).toEqual({ href: '/activos/l5', label: 'Ver el activo' });
    });

    it('canal publicado por otra persona: el mensaje de la API, sin enlace', async () => {
        createListingFromYouTubeConnection.mockRejectedValue(
            new ApiError('INVALID_STATE', 'Ese canal ya está publicado.', 409),
        );

        const estado = await createYouTubeListing('UC123', {}, form(datos));

        expect(estado.error).toBe('Ese canal ya está publicado.');
        expect(estado.next).toBeUndefined();
    });

    it('otros errores de la API se muestran con su mensaje', async () => {
        createListingFromYouTubeConnection.mockRejectedValue(
            new ApiError('NOT_FOUND', 'Ese canal no está conectado a tu cuenta. Conectalo primero.', 404),
        );

        const estado = await createYouTubeListing('UC123', {}, form(datos));

        expect(estado.error).toBe('Ese canal no está conectado a tu cuenta. Conectalo primero.');
    });

    it('un fallo inesperado no deja la pantalla muda', async () => {
        createListingFromYouTubeConnection.mockRejectedValue(new Error('boom'));

        const estado = await createYouTubeListing('UC123', {}, form(datos));

        expect(estado.error).toBe('No pudimos publicar el canal. Probá de nuevo.');
    });
});

describe('startYouTubeConnection', () => {
    it('guarda el state en la cookie y manda a Google con ese mismo state', async () => {
        youTubeAuthorizationUrl.mockResolvedValue({ url: 'https://accounts.google.com/auth' });

        const destino = await redirigeA(startYouTubeConnection());

        const { state } = youTubeAuthorizationUrl.mock.calls[0][0] as { state: string };
        expect(state).toMatch(/^[0-9a-f]{32}$/);
        expect(cookieSet).toHaveBeenCalledWith(
            YOUTUBE_STATE_COOKIE,
            state,
            expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/api/youtube' }),
        );
        expect(destino).toBe('https://accounts.google.com/auth');
    });

    it('integración sin configurar (503): vuelve a /vender sin dejar cookie', async () => {
        youTubeAuthorizationUrl.mockRejectedValue(new ApiError('INTERNAL', 'No configurado.', 503));

        const destino = await redirigeA(startYouTubeConnection());

        expect(destino).toBe('/vender?conexion=no-configurada');
        expect(cookieSet).not.toHaveBeenCalled();
    });

    it('otro fallo: vuelve con no-disponible', async () => {
        youTubeAuthorizationUrl.mockRejectedValue(new Error('red'));

        expect(await redirigeA(startYouTubeConnection())).toBe('/vender?conexion=no-disponible');
        expect(cookieSet).not.toHaveBeenCalled();
    });
});

describe('publishListing (formulario manual)', () => {
    it('devuelve al activo creado en vez de dejar al vendedor sin enlace', async () => {
        createListing.mockResolvedValue({ id: 'l7' });

        const destino = await redirigeA(
            publishListing(
                {},
                form({ assetType: 'youtube', precio: '100', moneda: 'USD', nombre: 'Canal', identidad: 'UCabc' }),
            ),
        );

        expect(destino).toBe('/activos/l7');
        expect(revalidatePath).toHaveBeenCalledWith('/activos');
    });

    it('si la API rechaza, muestra el error y no redirige', async () => {
        createListing.mockRejectedValue(new ApiError('VALIDATION', 'Dato inválido.', 400));

        const estado = await publishListing(
            {},
            form({ assetType: 'youtube', precio: '100', moneda: 'USD', nombre: 'Canal', identidad: 'UCabc' }),
        );

        expect(estado.error).toBe('Dato inválido.');
    });

    it('con la venta de sitios en pausa, un sitio no llega a la API', async () => {
        const estado = await publishListing(
            {},
            form({ assetType: 'web', precio: '100', moneda: 'USD', nombre: 'Sitio', identidad: 'a.com' }),
        );

        expect(estado.error).toBe('Habilitaremos la venta de sitios web próximamente.');
        expect(createListing).not.toHaveBeenCalled();
    });
});
