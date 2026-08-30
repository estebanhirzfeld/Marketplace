import { describe, it, expect, vi } from 'vitest';
import { MarketplaceClient } from '../src/MarketplaceClient';
import { ApiError } from '../src/ApiError';

/**
 * El cliente se testea con un `fetch` inyectado, sin red ni servidor. Lo que
 * se verifica es el contrato de transporte: qué URL arma, qué headers manda,
 * cómo trata un 204 y cómo convierte un error de la API en un ApiError.
 *
 * Es TypeScript puro: estos mismos tests valen para el uso desde React Native.
 */

function fetchQueDevuelve(
    status: number,
    body?: unknown,
): { impl: typeof fetch; llamadas: Array<[string, RequestInit | undefined]> } {
    const llamadas: Array<[string, RequestInit | undefined]> = [];

    const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        llamadas.push([String(url), init]);
        // El spec prohíbe cuerpo en un 204: debe ser null, no cadena vacía.
        const sinCuerpo = status === 204 || status === 205 || status === 304;
        return new Response(
            sinCuerpo || body === undefined ? null : JSON.stringify(body),
            { status, headers: { 'content-type': 'application/json' } },
        );
    }) as unknown as typeof fetch;

    return { impl, llamadas };
}

describe('MarketplaceClient — construcción de requests', () => {
    it('arma la URL sin duplicar la barra final del baseUrl', async () => {
        const { impl, llamadas } = fetchQueDevuelve(200, []);
        const client = new MarketplaceClient({ baseUrl: 'http://api.test/', fetchImpl: impl });

        await client.listings();

        expect(llamadas[0][0]).toBe('http://api.test/listings');
    });

    it('adjunta el Bearer token en las rutas protegidas', async () => {
        const { impl, llamadas } = fetchQueDevuelve(200, []);
        const client = new MarketplaceClient({
            baseUrl: 'http://api.test',
            getToken: () => 'token-abc',
            fetchImpl: impl,
        });

        await client.offersOf('listing-1');

        const headers = llamadas[0][1]?.headers as Record<string, string>;
        expect(headers.authorization).toBe('Bearer token-abc');
    });

    /**
     * En React Native el token sale de secure storage, que es asíncrono. El
     * provider acepta una promesa justamente por eso.
     */
    it('acepta un proveedor de token asíncrono', async () => {
        const { impl, llamadas } = fetchQueDevuelve(200, []);
        const client = new MarketplaceClient({
            baseUrl: 'http://api.test',
            getToken: async () => 'token-async',
            fetchImpl: impl,
        });

        await client.offersOf('listing-1');

        const headers = llamadas[0][1]?.headers as Record<string, string>;
        expect(headers.authorization).toBe('Bearer token-async');
    });

    it('no manda Authorization en las rutas anónimas', async () => {
        const { impl, llamadas } = fetchQueDevuelve(200, { token: 'x', actor: {} });
        const client = new MarketplaceClient({
            baseUrl: 'http://api.test',
            getToken: () => 'token-abc',
            fetchImpl: impl,
        });

        await client.login({ email: 'a@b.com', password: 'marketplace1' });

        const headers = llamadas[0][1]?.headers as Record<string, string>;
        expect(headers.authorization).toBeUndefined();
    });

    it('omite el header cuando no hay token disponible', async () => {
        const { impl, llamadas } = fetchQueDevuelve(200, []);
        const client = new MarketplaceClient({
            baseUrl: 'http://api.test',
            getToken: () => undefined,
            fetchImpl: impl,
        });

        await client.offersOf('listing-1');

        const headers = llamadas[0][1]?.headers as Record<string, string>;
        expect(headers.authorization).toBeUndefined();
    });

    it('escapa los ids en la ruta', async () => {
        const { impl, llamadas } = fetchQueDevuelve(204);
        const client = new MarketplaceClient({ baseUrl: 'http://api.test', fetchImpl: impl });

        await client.acceptOffer('id con espacios/y-barra');

        expect(llamadas[0][0]).toBe(
            'http://api.test/operations/id%20con%20espacios%2Fy-barra/accept',
        );
    });

    it('serializa el body y declara content-type', async () => {
        const { impl, llamadas } = fetchQueDevuelve(204);
        const client = new MarketplaceClient({ baseUrl: 'http://api.test', fetchImpl: impl });

        await client.counterOffer('op-1', { price: { cents: 150000, currency: 'USD' } });

        const [, init] = llamadas[0];
        expect((init?.headers as Record<string, string>)['content-type']).toBe('application/json');
        expect(JSON.parse(init?.body as string)).toEqual({
            price: { cents: 150000, currency: 'USD' },
        });
    });
});

describe('MarketplaceClient — respuestas', () => {
    it('devuelve el JSON parseado en un 200', async () => {
        const { impl } = fetchQueDevuelve(200, [
            { id: 'l1', status: 'published', askingPrice: { cents: 1000, currency: 'USD' } },
        ]);
        const client = new MarketplaceClient({ baseUrl: 'http://api.test', fetchImpl: impl });

        const listings = await client.listings();

        expect(listings).toHaveLength(1);
        expect(listings[0].id).toBe('l1');
    });

    it('resuelve sin romper ante un 204 sin cuerpo', async () => {
        const { impl } = fetchQueDevuelve(204);
        const client = new MarketplaceClient({ baseUrl: 'http://api.test', fetchImpl: impl });

        await expect(
            client.confirmCustody('op-1', {
                isPrimaryOwner: true,
                accessSecured: true,
                metrics: { suscriptores: 55000 },
            }),
        ).resolves.toBeUndefined();
    });
});

describe('MarketplaceClient — errores', () => {
    it('convierte el error de la API en ApiError conservando el code', async () => {
        const { impl } = fetchQueDevuelve(403, {
            code: 'FORBIDDEN',
            message: 'No sos parte de esta operación.',
        });
        const client = new MarketplaceClient({ baseUrl: 'http://api.test', fetchImpl: impl });

        const error = await client.acceptOffer('op-1').catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).code).toBe('FORBIDDEN');
        expect((error as ApiError).status).toBe(403);
        expect((error as ApiError).message).toBe('No sos parte de esta operación.');
    });

    it('marca requiereLogin ante un 401', async () => {
        const { impl } = fetchQueDevuelve(401, {
            code: 'UNAUTHORIZED',
            message: 'Credenciales ausentes o inválidas.',
        });
        const client = new MarketplaceClient({ baseUrl: 'http://api.test', fetchImpl: impl });

        const error = (await client.listing('l1').catch((e: unknown) => e)) as ApiError;

        expect(error.requiereLogin).toBe(true);
    });

    /**
     * Un proxy caído o un balanceador devuelven HTML, no JSON. El cliente no
     * debe morir con un error de parseo indescifrable en vez del status real.
     */
    it('no explota cuando el error no viene en JSON', async () => {
        const impl = vi.fn(async () =>
            new Response('<html>502 Bad Gateway</html>', { status: 502 }),
        ) as unknown as typeof fetch;
        const client = new MarketplaceClient({ baseUrl: 'http://api.test', fetchImpl: impl });

        const error = (await client.listings().catch((e: unknown) => e)) as ApiError;

        expect(error).toBeInstanceOf(ApiError);
        expect(error.code).toBe('INTERNAL');
        expect(error.status).toBe(502);
    });
});
