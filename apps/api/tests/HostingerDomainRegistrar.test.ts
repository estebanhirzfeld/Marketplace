import { describe, it, expect } from 'vitest';
import {
    DomainPremiumProtectionError,
    DomainRegistrarRejectedError,
    ServiceUnavailableError,
} from '@marketplace/domain/src/errors/DomainError';
import { DomainName } from '@marketplace/domain/src/value-objects/DomainName';
import { Email } from '@marketplace/domain/src/value-objects/Email';
import { HostingerDomainRegistrar } from '../src/adapters/HostingerDomainRegistrar';

/**
 * Sin red: `fetch` es una cola de respuestas y cada pedido queda registrado.
 * Los cuerpos de las respuestas siguen los esquemas de la especificación
 * OpenAPI de Hostinger (`Domains.V1.Move.MoveResource`,
 * `Domains.V1.Domain.DomainExtendedResource`, `AuthCodeResource`).
 */

const TOKEN = 'tok_super_secreto_12345';
const BASE_URL = 'https://developers.hostinger.com';
const domain = DomainName.parse('ejemplo.com');

interface Call {
    url: string;
    method: string;
    headers: Headers;
    body: unknown;
}

type Step = Response | Error | ((signal: AbortSignal | undefined) => Promise<Response>);

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', ...headers },
    });
}

function setup(steps: Step[], options: { timeoutMs?: number } = {}) {
    const calls: Call[] = [];
    const sleeps: number[] = [];
    const queue = [...steps];

    const fetchImpl: typeof fetch = async (input, init) => {
        calls.push({
            url: String(input),
            method: init?.method ?? 'GET',
            headers: new Headers(init?.headers),
            body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        });
        const step = queue.shift();
        if (step === undefined) throw new Error('fetch sin respuesta preparada');
        if (step instanceof Error) throw step;
        if (typeof step === 'function') return step(init?.signal ?? undefined);
        return step;
    };

    const registrar = new HostingerDomainRegistrar({
        token: TOKEN,
        fetchImpl,
        sleep: async (ms) => {
            sleeps.push(ms);
        },
        ...options,
    });
    return { registrar, calls, sleeps };
}

/** El error que lanza la promesa, para inspeccionarlo sin `as`. */
async function failureOf(work: Promise<unknown>): Promise<Error> {
    try {
        await work;
    } catch (error) {
        if (error instanceof Error) return error;
    }
    throw new Error('se esperaba un error');
}

/** Un perfil WHOIS como lo lista `GET /api/domains/v1/whois`, con lo que el adaptador lee. */
function whoisProfile(id: number, tld: string, isDefault: boolean) {
    return { id, tld, country: 'AR', entity_type: 'individual', is_default: isDefault, whois_details: {}, tld_details: {} };
}

const moveBody = {
    domain: 'ejemplo.com',
    status: 'activating',
    created_at: '2026-10-20T10:00:00Z',
    updated_at: '2026-10-20T11:00:00Z',
};

const portfolioBody = {
    domain: 'ejemplo.com',
    status: 'active',
    message: null,
    is_locked: true,
    is_lockable: true,
    '60_days_lock_expires_at': '2026-12-19T10:00:00Z',
    registered_at: '2025-02-27T12:54:22Z',
    expires_at: '2027-02-27T11:54:22Z',
    domain_contacts: { owner_id: 614698, admin_id: 114698, billing_id: 154698, tech_id: 524248 },
};

describe('HostingerDomainRegistrar — lecturas', () => {
    it('lee el estado aunque Hostinger lo mande con mayúscula, como hace la API real', async () => {
        // La especificación dice `active`; la API real devolvió `Active` para
        // deliaorrego.online el 21/10/2026.
        const { registrar } = setup([json(200, { ...portfolioBody, status: 'Active' })]);

        const entry = await registrar.getPortfolioEntry(domain);

        expect(entry?.status).toBe('active');
    });

    it('lee el estado de un traslado aunque venga con mayúscula', async () => {
        const { registrar } = setup([json(200, { ...moveBody, status: 'Completed' })]);

        const move = await registrar.getIncomingMove(domain);

        expect(move?.status).toBe('completed');
    });

    it('lee el dominio del portfolio con Bearer y la URL codificada', async () => {
        const { registrar, calls } = setup([json(200, portfolioBody)]);

        const entry = await registrar.getPortfolioEntry(domain);

        expect(entry).toEqual({
            domain,
            status: 'active',
            isLocked: true,
            sixtyDayLockExpiresAt: new Date('2026-12-19T10:00:00Z'),
            registeredAt: new Date('2025-02-27T12:54:22Z'),
            expiresAt: new Date('2027-02-27T11:54:22Z'),
        });
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toBe(`${BASE_URL}/api/domains/v1/portfolio/ejemplo.com`);
        expect(calls[0]!.method).toBe('GET');
        expect(calls[0]!.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    });

    it('acepta fechas ausentes o nulas', async () => {
        const { registrar } = setup([
            json(200, { domain: 'ejemplo.com', status: 'pending_setup', is_locked: false, expires_at: null }),
        ]);

        const entry = await registrar.getPortfolioEntry(domain);

        expect(entry).toMatchObject({
            status: 'pending_setup',
            isLocked: false,
            sixtyDayLockExpiresAt: null,
            registeredAt: null,
            expiresAt: null,
        });
    });

    it.each([
        ['getPortfolioEntry', '/api/domains/v1/portfolio/ejemplo.com'],
        ['getIncomingMove', '/api/domains/v1/move/incoming/ejemplo.com'],
        ['getOutgoingMove', '/api/domains/v1/move/outgoing/ejemplo.com'],
    ] as const)('%s: 404 es "no hay", no un error', async (method, path) => {
        const { registrar, calls } = setup([json(404, { message: 'Not found' })]);

        await expect(registrar[method](domain)).resolves.toBeNull();
        expect(calls[0]!.url).toBe(`${BASE_URL}${path}`);
    });

    it('lee el traslado entrante y el saliente', async () => {
        const { registrar } = setup([json(200, moveBody), json(200, { ...moveBody, status: 'completed' })]);

        const incoming = await registrar.getIncomingMove(domain);
        const outgoing = await registrar.getOutgoingMove(domain);

        expect(incoming).toEqual({
            domain,
            status: 'activating',
            createdAt: new Date('2026-10-20T10:00:00Z'),
            updatedAt: new Date('2026-10-20T11:00:00Z'),
        });
        expect(outgoing?.status).toBe('completed');
    });

    it('un estado que la especificación no enumera no se interpreta: no disponible', async () => {
        const { registrar } = setup([json(200, { ...moveBody, status: 'teleporting' })]);

        await expect(registrar.getIncomingMove(domain)).rejects.toBeInstanceOf(ServiceUnavailableError);
    });

    it('un cuerpo que no es el esperado es no disponible', async () => {
        const { registrar } = setup([json(200, ['otra', 'cosa'])]);

        await expect(registrar.getPortfolioEntry(domain)).rejects.toBeInstanceOf(ServiceUnavailableError);
    });

    it('devuelve el código de autorización, o null si no hay', async () => {
        const { registrar, calls } = setup([json(200, { auth_code: 'RN0000' }), json(200, { auth_code: null })]);

        await expect(registrar.getAuthCode(domain)).resolves.toBe('RN0000');
        await expect(registrar.getAuthCode(domain)).resolves.toBeNull();
        expect(calls[0]!.url).toBe(`${BASE_URL}/api/domains/v1/portfolio/ejemplo.com/auth-code`);
    });
});

describe('HostingerDomainRegistrar — escrituras', () => {
    it('acepta el traslado entrante con el perfil WHOIS de la terminación del dominio en los cuatro contactos', async () => {
        const { registrar, calls } = setup([
            json(200, [whoisProfile(16296262, 'com', false)]),
            json(200, { message: 'Request accepted' }),
        ]);

        await registrar.acceptIncomingMove(domain);

        expect(calls[0]!.method).toBe('GET');
        expect(calls[0]!.url).toBe(`${BASE_URL}/api/domains/v1/whois?tld=com`);
        expect(calls[1]!.method).toBe('PUT');
        expect(calls[1]!.url).toBe(`${BASE_URL}/api/domains/v1/move/incoming/ejemplo.com`);
        expect(calls[1]!.headers.get('content-type')).toBe('application/json');
        expect(calls[1]!.body).toEqual({
            domain_contacts: { owner_id: 16296262, admin_id: 16296262, billing_id: 16296262, tech_id: 16296262 },
        });
    });

    it('con varios perfiles para la misma terminación usa el marcado por defecto', async () => {
        const { registrar, calls } = setup([
            json(200, [whoisProfile(1, 'online', false), whoisProfile(2, 'online', true)]),
            json(200, { message: 'Request accepted' }),
        ]);

        await registrar.acceptIncomingMove(DomainName.parse('deliaorrego.online'));

        expect(calls[0]!.url).toBe(`${BASE_URL}/api/domains/v1/whois?tld=online`);
        expect(calls[1]!.body).toEqual({ domain_contacts: { owner_id: 2, admin_id: 2, billing_id: 2, tech_id: 2 } });
    });

    it('ignora perfiles de otra terminación aunque Hostinger los devuelva', async () => {
        const { registrar, calls } = setup([
            json(200, [whoisProfile(9, 'online', true), whoisProfile(3, 'com', false)]),
            json(200, { message: 'Request accepted' }),
        ]);

        await registrar.acceptIncomingMove(domain);

        expect(calls[1]!.body).toEqual({ domain_contacts: { owner_id: 3, admin_id: 3, billing_id: 3, tech_id: 3 } });
    });

    it('sin perfil WHOIS para la terminación no acepta y dice qué falta', async () => {
        const { registrar, calls } = setup([json(200, [])]);

        const error = await failureOf(registrar.acceptIncomingMove(DomainName.parse('ejemplo.net')));

        expect(error).toBeInstanceOf(DomainRegistrarRejectedError);
        expect(error.message).toBe(
            'Falta un perfil WHOIS para .net en la cuenta de Hostinger de la plataforma: crealo y volvé a comprobar.',
        );
        expect(calls).toHaveLength(1);
    });

    it('una lista de perfiles que no es una lista se trata como servicio no disponible', async () => {
        const { registrar, calls } = setup([json(200, { unexpected: true })]);

        await expect(registrar.acceptIncomingMove(domain)).rejects.toBeInstanceOf(ServiceUnavailableError);
        expect(calls).toHaveLength(1);
    });

    it('inicia el traslado saliente con el correo del destinatario', async () => {
        const { registrar, calls } = setup([json(200, { message: 'Request accepted' })]);

        await registrar.startOutgoingMove(domain, Email.create('Comprador@Ejemplo.com'));

        expect(calls[0]!.method).toBe('POST');
        expect(calls[0]!.url).toBe(`${BASE_URL}/api/domains/v1/move/outgoing/ejemplo.com`);
        expect(calls[0]!.body).toEqual({ new_customer_email: 'comprador@ejemplo.com' });
    });

    it('cancela el traslado saliente', async () => {
        const { registrar, calls } = setup([json(200, { message: 'Request accepted' })]);

        await registrar.cancelOutgoingMove(domain);

        expect(calls[0]!.method).toBe('DELETE');
        expect(calls[0]!.url).toBe(`${BASE_URL}/api/domains/v1/move/outgoing/ejemplo.com`);
        expect(calls[0]!.body).toBeUndefined();
    });

    it('422 es un rechazo y no incluye la respuesta del registrador en el mensaje', async () => {
        const { registrar } = setup([json(422, { message: 'The domain must be active.', errors: {} })]);

        const error = await failureOf(registrar.startOutgoingMove(domain, Email.create('a@b.com')));

        expect(error).toBeInstanceOf(DomainRegistrarRejectedError);
        expect(error.message).not.toContain('must be active');
    });

    it('404 al aceptar un traslado que no existe es un rechazo', async () => {
        const { registrar } = setup([json(200, [whoisProfile(1, 'com', true)]), json(404, { message: 'Not found' })]);

        await expect(registrar.acceptIncomingMove(domain)).rejects.toBeInstanceOf(DomainRegistrarRejectedError);
    });
});

describe('HostingerDomainRegistrar — errores por estado', () => {
    it('428 es protección premium, también en una lectura', async () => {
        const { registrar } = setup([json(428, { message: 'Premium protection' })]);

        await expect(registrar.getAuthCode(domain)).rejects.toBeInstanceOf(DomainPremiumProtectionError);
    });

    it.each([500, 502, 503])('%i es no disponible', async (status) => {
        const { registrar, calls } = setup([json(status, { message: 'boom' })]);

        await expect(registrar.getPortfolioEntry(domain)).rejects.toBeInstanceOf(ServiceUnavailableError);
        expect(calls).toHaveLength(1);
    });

    it.each([401, 403])('%i (credenciales) es no disponible, no un rechazo del dominio', async (status) => {
        const { registrar } = setup([json(status, { message: 'Unauthenticated' })]);

        await expect(registrar.getPortfolioEntry(domain)).rejects.toBeInstanceOf(ServiceUnavailableError);
    });

    it('un 4xx de validación que no es 422 también es un rechazo', async () => {
        const { registrar } = setup([json(409, { message: 'conflict' })]);

        await expect(registrar.cancelOutgoingMove(domain)).rejects.toBeInstanceOf(DomainRegistrarRejectedError);
    });

    it('una falla de red es no disponible', async () => {
        const { registrar } = setup([new TypeError('fetch failed')]);

        await expect(registrar.getPortfolioEntry(domain)).rejects.toBeInstanceOf(ServiceUnavailableError);
    });

    it('si el registrador no responde a tiempo, aborta y es no disponible', async () => {
        let aborted = false;
        const { registrar } = setup(
            [
                (signal) =>
                    new Promise<Response>((_, reject) => {
                        signal?.addEventListener('abort', () => {
                            aborted = true;
                            reject(new DOMException('aborted', 'AbortError'));
                        });
                    }),
            ],
            { timeoutMs: 20 },
        );

        await expect(registrar.getPortfolioEntry(domain)).rejects.toBeInstanceOf(ServiceUnavailableError);
        expect(aborted).toBe(true);
    });

    it('el token no aparece en ningún mensaje de error', async () => {
        const failures: Step[] = [
            json(500, { message: `echo ${TOKEN}` }),
            json(422, { message: `echo ${TOKEN}` }),
            json(428, { message: `echo ${TOKEN}` }),
            new TypeError(`fetch failed ${TOKEN}`),
        ];
        const { registrar } = setup(failures);

        for (let i = 0; i < failures.length; i++) {
            const error = await failureOf(registrar.getAuthCode(domain));
            expect(error.message).not.toContain(TOKEN);
            expect(String(error.cause ?? '')).not.toContain(TOKEN);
        }
    });
});

describe('HostingerDomainRegistrar — límite de uso', () => {
    it('ante 429 espera lo que pide Retry-After y reintenta una vez', async () => {
        const { registrar, calls, sleeps } = setup([
            json(429, { message: 'slow down' }, { 'retry-after': '2' }),
            json(200, moveBody),
        ]);

        const move = await registrar.getIncomingMove(domain);

        expect(move?.status).toBe('activating');
        expect(calls).toHaveLength(2);
        expect(sleeps).toEqual([2_000]);
    });

    it('acota la espera de Retry-After', async () => {
        const { registrar, sleeps } = setup([json(429, {}, { 'retry-after': '3600' }), json(200, moveBody)]);

        await registrar.getIncomingMove(domain);

        expect(sleeps).toEqual([5_000]);
    });

    it('sin Retry-After usa una espera corta por defecto', async () => {
        const { registrar, sleeps } = setup([json(429, {}), json(200, moveBody)]);

        await registrar.getIncomingMove(domain);

        expect(sleeps).toEqual([1_000]);
    });

    it('si el segundo intento también es 429, es no disponible y no hay un tercero', async () => {
        const { registrar, calls } = setup([json(429, {}), json(429, {})]);

        await expect(registrar.getIncomingMove(domain)).rejects.toBeInstanceOf(ServiceUnavailableError);
        expect(calls).toHaveLength(2);
    });
});

describe('HostingerDomainRegistrar — dominio y configuración', () => {
    it('la URL usa el nombre ya normalizado por DomainName', async () => {
        const { registrar, calls } = setup([json(404, {})]);

        await registrar.getPortfolioEntry(DomainName.parse('https://www.Niño.com/ruta'));

        expect(calls[0]!.url).toBe(`${BASE_URL}/api/domains/v1/portfolio/xn--nio-8ma.com`);
    });

    it('respeta una baseUrl con barra final', async () => {
        const calls: string[] = [];
        const registrar = new HostingerDomainRegistrar({
            token: TOKEN,
            baseUrl: 'https://registrar.test/',
            fetchImpl: async (input) => {
                calls.push(String(input));
                return json(404, {});
            },
        });

        await registrar.getPortfolioEntry(domain);

        expect(calls).toEqual(['https://registrar.test/api/domains/v1/portfolio/ejemplo.com']);
    });

    it('rechaza un token vacío', () => {
        expect(() => new HostingerDomainRegistrar({ token: '  ' })).toThrow('Falta el token de la API de Hostinger.');
    });
});
