import { describe, it, expect, vi } from 'vitest';
import { GoogleOAuthClient } from '../src/adapters/GoogleOAuthClient';
import {
    AdSenseApiReader,
    YouTubeOAuthCustodyAccessReader,
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

    /**
     * Verificación del acceso de la plataforma: el admin ingresa con la cuenta
     * de custodia. Se la sugiere a Google y se lo deja elegir la Cuenta de
     * Marca, pero sin `consent`: no hace falta volver a pedir permiso cada vez.
     */
    it('puede sugerir la cuenta (login_hint) y pedir solo el selector de cuentas', () => {
        const url = new URL(
            new GoogleOAuthClient(CONFIG).authorizationUrl('un.scope', 'e', {
                loginHint: 'custodia@traspaso.com',
                prompt: 'select_account',
            }),
        );

        expect(url.searchParams.get('login_hint')).toBe('custodia@traspaso.com');
        expect(url.searchParams.get('prompt')).toBe('select_account');
        expect(url.searchParams.get('access_type')).toBe('online');
    });

    it('puede pedir el selector de canales de YouTube (enable_yt_permissions)', () => {
        const url = new URL(
            new GoogleOAuthClient(CONFIG).authorizationUrl('un.scope openid email', 'e', {
                enableYoutubePermissions: true,
            }),
        );

        expect(url.searchParams.get('enable_yt_permissions')).toBe('true');
        expect(url.searchParams.get('scope')).toBe('un.scope openid email');
    });

    it('sin opciones no agrega login_hint ni enable_yt_permissions y conserva el prompt de siempre', () => {
        const url = new URL(new GoogleOAuthClient(CONFIG).authorizationUrl('un.scope', 'e'));

        expect(url.searchParams.has('login_hint')).toBe(false);
        expect(url.searchParams.get('prompt')).toBe('select_account consent');
    });

    it('el canje con identidad devuelve también el id_token si Google lo manda', async () => {
        const impl = fetchQueDevuelve(json({ access_token: 'tok', id_token: 'a.b.c' }));

        const canje = await new GoogleOAuthClient(CONFIG, impl).exchangeWithIdentity('codigo');

        expect(canje).toEqual({ accessToken: 'tok', idToken: 'a.b.c' });
    });

    it('el canje con identidad no exige id_token', async () => {
        const impl = fetchQueDevuelve(json({ access_token: 'tok' }));

        const canje = await new GoogleOAuthClient(CONFIG, impl).exchangeWithIdentity('codigo');

        expect(canje).toEqual({ accessToken: 'tok', idToken: undefined });
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

/** Un id_token con la forma de Google: solo importa el payload. */
function idToken(payload: Record<string, unknown>): string {
    const parte = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    return `${parte({ alg: 'RS256' })}.${parte(payload)}.firma`;
}

describe('YouTubeOAuthCustodyAccessReader', () => {
    function armar(token: Record<string, unknown> | string | undefined, ...respuestas: Response[]) {
        const jwt = typeof token === 'string' ? token : token ? idToken(token) : undefined;
        const impl = fetchQueDevuelve(
            json(jwt ? { access_token: 'token-de-un-solo-uso', id_token: jwt } : { access_token: 'token-de-un-solo-uso' }),
            ...respuestas,
        );
        return new YouTubeOAuthCustodyAccessReader(new GoogleOAuthClient(CONFIG, impl), impl);
    }

    const CANALES = () => json({ items: [{ id: 'UCq-Fj5jknLsUf-MWSy4_brA', snippet: { title: 'Canal uno' } }] });

    it('devuelve quién autorizó junto con los canales', async () => {
        const lector = armar({ email: 'custodia@traspaso.com', email_verified: true, sub: '1234' }, CANALES());

        const r = await lector.authorizedChannelsOf('codigo');

        expect(r.authorizer).toEqual({ email: 'custodia@traspaso.com', emailVerified: true, subject: '1234' });
        expect(r.channels).toEqual([{ channelId: 'UCq-Fj5jknLsUf-MWSy4_brA', title: 'Canal uno' }]);
    });

    it('sin id_token no hay identidad', async () => {
        const r = await armar(undefined, CANALES()).authorizedChannelsOf('codigo');

        expect(r.authorizer).toBeNull();
        expect(r.channels).toHaveLength(1);
    });

    it('un id_token ilegible o sin correo o sin sub no cuenta como identidad', async () => {
        for (const token of ['no-es-un-jwt', 'a.%%%.c', idToken({ sub: '1' }), idToken({ email: 'a@b.com' })]) {
            const r = await armar(token, CANALES()).authorizedChannelsOf('codigo');
            expect(r.authorizer).toBeNull();
        }
    });

    it('email_verified distinto de true es no verificado', async () => {
        const r = await armar({ email: 'a@b.com', email_verified: 'true', sub: '1' }, CANALES()).authorizedChannelsOf('c');

        expect(r.authorizer?.emailVerified).toBe(false);
    });

    it('no filtra el token cuando la API falla', async () => {
        const lector = armar({ email: 'a@b.com', email_verified: true, sub: '1' }, json({ error: 'x' }, 401));

        await expect(lector.authorizedChannelsOf('codigo')).rejects.not.toThrow(/token-de-un-solo-uso/);
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
