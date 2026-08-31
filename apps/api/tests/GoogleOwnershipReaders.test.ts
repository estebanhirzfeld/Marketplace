import { describe, it, expect, vi } from 'vitest';
import { GoogleOAuthClient } from '../src/adapters/GoogleOAuthClient';
import {
    AdSenseApiReader,
    YouTubeOAuthOwnershipReader,
} from '../src/adapters/GoogleOwnershipReaders';

/**
 * Los adaptadores contra respuestas fabricadas. Lo que se prueba es la
 * traducción y, sobre todo, que ni el token ni el secreto se filtren en el
 * mensaje de un error: son los dos datos que no pueden terminar en un log.
 */

const CONFIG = {
    clientId: 'cliente',
    clientSecret: 'secreto-que-no-debe-aparecer',
    redirectUri: 'http://localhost:3000/api/youtube/callback',
};

function json(cuerpo: unknown, status = 200): Response {
    return new Response(JSON.stringify(cuerpo), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

/** Fábrica y no constante: el cuerpo de un Response se lee una sola vez. */
const TOKEN = () => json({ access_token: 'token-de-un-solo-uso' });

/** Encadena respuestas en el orden en que el adaptador las va a pedir. */
function fetchQueDevuelve(...respuestas: Response[]) {
    const impl = vi.fn();
    for (const r of respuestas) impl.mockResolvedValueOnce(r);
    return impl;
}

describe('GoogleOAuthClient', () => {
    it('arma la dirección de autorización sin pedir refresh token', () => {
        const url = new URL(new GoogleOAuthClient(CONFIG).authorizationUrl('un.scope', 'estado-1'));

        expect(url.searchParams.get('access_type')).toBe('online');
        expect(url.searchParams.get('scope')).toBe('un.scope');
        expect(url.searchParams.get('state')).toBe('estado-1');
        expect(url.searchParams.get('response_type')).toBe('code');
    });

    /** Un canal puede vivir bajo una Cuenta de Marca distinta de la sesión abierta. */
    it('fuerza a elegir la cuenta', () => {
        const url = new URL(new GoogleOAuthClient(CONFIG).authorizationUrl('un.scope', 'e'));

        expect(url.searchParams.get('prompt')).toContain('select_account');
    });

    it('devuelve el token del canje', async () => {
        const impl = fetchQueDevuelve(TOKEN());

        const token = await new GoogleOAuthClient(CONFIG, impl).exchange('codigo');

        expect(token).toBe('token-de-un-solo-uso');
    });

    it('no filtra el secreto de cliente cuando Google rechaza el código', async () => {
        const impl = fetchQueDevuelve(json({ error: 'invalid_grant', secret: CONFIG.clientSecret }, 400));

        await expect(new GoogleOAuthClient(CONFIG, impl).exchange('codigo')).rejects.not.toThrow(
            /secreto-que-no-debe-aparecer/,
        );
    });

    it('falla si Google no devuelve token', async () => {
        const impl = fetchQueDevuelve(json({}));

        await expect(new GoogleOAuthClient(CONFIG, impl).exchange('codigo')).rejects.toThrow(
            /token de acceso/,
        );
    });
});

describe('YouTubeOAuthOwnershipReader', () => {
    function armar(...respuestas: Response[]) {
        const impl = fetchQueDevuelve(TOKEN(), ...respuestas);
        return {
            lector: new YouTubeOAuthOwnershipReader(new GoogleOAuthClient(CONFIG, impl), impl),
            impl,
        };
    }

    it('devuelve los canales que controla la cuenta', async () => {
        const { lector } = armar(
            json({
                items: [
                    { id: 'UCq-Fj5jknLsUf-MWSy4_brA', snippet: { title: 'Canal uno' } },
                    { id: 'UCotroCanalxxxxxxxxxxxx', snippet: { title: 'Canal dos' } },
                ],
            }),
        );

        const canales = await lector.channelsOf('codigo');

        expect(canales).toHaveLength(2);
        expect(canales[0]).toEqual({ channelId: 'UCq-Fj5jknLsUf-MWSy4_brA', title: 'Canal uno' });
    });

    it('consulta con mine=true, que es lo único que prueba el control', async () => {
        const { lector, impl } = armar(json({ items: [] }));

        await lector.channelsOf('codigo');

        // La primera llamada es el canje del token; la segunda, la consulta.
        const url = new URL(impl.mock.calls[1][0]);
        expect(url.searchParams.get('mine')).toBe('true');
    });

    it('devuelve vacío si la cuenta no controla ningún canal', async () => {
        const { lector } = armar(json({}));

        expect(await lector.channelsOf('codigo')).toEqual([]);
    });

    it('no filtra el token cuando la API falla', async () => {
        const { lector } = armar(json({ error: 'token-de-un-solo-uso inválido' }, 401));

        await expect(lector.channelsOf('codigo')).rejects.not.toThrow(/token-de-un-solo-uso/);
    });
});

describe('AdSenseApiReader', () => {
    const CUENTAS = () => json({ accounts: [{ name: 'accounts/pub-123' }] });

    function reporte(filas: Array<[string, string]>) {
        return json({
            headers: [
                { name: 'OWNED_SITE_DOMAIN_NAME' },
                { name: 'ESTIMATED_EARNINGS', currencyCode: 'USD' },
            ],
            rows: filas.map(([dominio, monto]) => ({ cells: [{ value: dominio }, { value: monto }] })),
            startDate: { year: 2026, month: 7, day: 31 },
            endDate: { year: 2026, month: 8, day: 29 },
        });
    }

    function armar(...respuestas: Response[]) {
        const impl = fetchQueDevuelve(TOKEN(), ...respuestas);
        return { lector: new AdSenseApiReader(new GoogleOAuthClient(CONFIG, impl), impl), impl };
    }

    it('convierte el ingreso del dominio a centavos', async () => {
        const { lector } = armar(CUENTAS(), reporte([['ejemplo.com', '784.50']]));

        const ingreso = await lector.monthlyEarningsFor('codigo', 'ejemplo.com');

        expect(ingreso?.earningsCents).toBe(78_450);
        expect(ingreso?.currency).toBe('USD');
        expect(ingreso?.from).toBeInstanceOf(Date);
    });

    it('elige la fila del dominio pedido y no la primera', async () => {
        const { lector } = armar(
            CUENTAS(),
            reporte([
                ['otrositio.com', '9999.00'],
                ['ejemplo.com', '784.50'],
            ]),
        );

        const ingreso = await lector.monthlyEarningsFor('codigo', 'ejemplo.com');

        expect(ingreso?.earningsCents).toBe(78_450);
    });

    it('ignora el www al comparar dominios', async () => {
        const { lector } = armar(CUENTAS(), reporte([['www.ejemplo.com', '100.00']]));

        expect((await lector.monthlyEarningsFor('codigo', 'ejemplo.com'))?.earningsCents).toBe(10_000);
    });

    /** Que el dominio no esté en el reporte es la respuesta, no una falla. */
    it('devuelve null si la cuenta no reporta ese dominio', async () => {
        const { lector } = armar(CUENTAS(), reporte([['otrositio.com', '500.00']]));

        expect(await lector.monthlyEarningsFor('codigo', 'ejemplo.com')).toBeNull();
    });

    it('devuelve null si la cuenta de Google no tiene AdSense', async () => {
        const { lector } = armar(json({}));

        expect(await lector.monthlyEarningsFor('codigo', 'ejemplo.com')).toBeNull();
    });

    it('pide la métrica y la dimensión correctas', async () => {
        const { lector, impl } = armar(CUENTAS(), reporte([]));

        await lector.monthlyEarningsFor('codigo', 'ejemplo.com');

        const url = new URL(impl.mock.calls[2][0]);
        expect(url.searchParams.getAll('metrics')).toContain('ESTIMATED_EARNINGS');
        expect(url.searchParams.getAll('dimensions')).toContain('OWNED_SITE_DOMAIN_NAME');
    });
});
