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
        whoisProfileId: 614698,
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
    it('acepta el traslado entrante con los cuatro contactos iguales', async () => {
        const { registrar, calls } = setup([json(200, { message: 'Request accepted' })]);

        await registrar.acceptIncomingMove(domain);

        expect(calls[0]!.method).toBe('PUT');
        expect(calls[0]!.url).toBe(`${BASE_URL}/api/domains/v1/move/incoming/ejemplo.com`);
        expect(calls[0]!.headers.get('content-type')).toBe('application/json');
        expect(calls[0]!.body).toEqual({
            domain_contacts: { owner_id: 614698, admin_id: 614698, billing_id: 614698, tech_id: 614698 },
        });
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
        const { registrar } = setup([json(404, { message: 'Not found' })]);

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
            whoisProfileId: 1,
            baseUrl: 'https://registrar.test/',
            fetchImpl: async (input) => {
                calls.push(String(input));
                return json(404, {});
            },
        });

        await registrar.getPortfolioEntry(domain);

        expect(calls).toEqual(['https://registrar.test/api/domains/v1/portfolio/ejemplo.com']);
    });

    it.each([
        ['token vacío', { token: '  ', whoisProfileId: 1 }],
        ['perfil cero', { token: 'x', whoisProfileId: 0 }],
        ['perfil decimal', { token: 'x', whoisProfileId: 1.5 }],
    ])('rechaza una configuración inválida: %s', (_name, options) => {
        expect(() => new HostingerDomainRegistrar(options)).toThrow();
    });
});
