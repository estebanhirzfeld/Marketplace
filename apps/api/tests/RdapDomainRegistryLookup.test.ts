import { describe, it, expect } from 'vitest';
import { ServiceUnavailableError } from '@marketplace/domain/src/errors/DomainError';
import { DomainName } from '@marketplace/domain/src/value-objects/DomainName';
import { RdapDomainRegistryLookup } from '../src/adapters/RdapDomainRegistryLookup';

/**
 * Sin red: `fetch` es un doble que registra el pedido. El cuerpo es el que
 * devolvió el registro de `.online` (Radix) para `deliaorrego.online` el
 * 21/10/2026, recortado a lo que se lee.
 */

const domain = DomainName.parse('deliaorrego.online');

const RADIX_RESPONSE = {
    objectClassName: 'domain',
    ldhName: 'deliaorrego.online',
    status: ['client transfer prohibited'],
    events: [
        { eventAction: 'registration', eventDate: '2026-02-05T19:01:20.000Z' },
        { eventAction: 'expiration', eventDate: '2027-02-05T23:59:59.000Z' },
        { eventAction: 'last changed', eventDate: '2026-10-20T20:04:29.441Z' },
    ],
    entities: [
        {
            objectClassName: 'entity',
            roles: ['registrar'],
            publicIds: [{ type: 'IANA Registrar ID', identifier: '1636' }],
            vcardArray: ['vcard', [['version', {}, 'text', '4.0'], ['fn', {}, 'text', 'HOSTINGER operations, UAB']]],
        },
    ],
};

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/rdap+json' } });
}

function setup(reply: Response | Error | ((signal?: AbortSignal) => Promise<Response>), timeoutMs?: number) {
    const calls: { url: string; headers: Headers }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
        calls.push({ url: String(input), headers: new Headers(init?.headers) });
        if (reply instanceof Error) throw reply;
        if (typeof reply === 'function') return reply(init?.signal ?? undefined);
        return reply;
    };
    return { calls, lookup: new RdapDomainRegistryLookup({ fetchImpl, timeoutMs }) };
}

describe('RdapDomainRegistryLookup', () => {
    it('lee registrador, estados y vencimiento del registro', async () => {
        const { calls, lookup } = setup(json(200, RADIX_RESPONSE));

        const record = await lookup.lookup(domain);

        expect(calls[0].url).toBe('https://rdap.org/domain/deliaorrego.online');
        expect(calls[0].headers.get('accept')).toContain('application/rdap+json');
        // rdap.org responde 403 al «node» que manda fetch por defecto (probado
        // el 21/10/2026): el pedido tiene que identificarse.
        expect(calls[0].headers.get('user-agent')).toMatch(/^Marketplace-RDAP\//);
        expect(record).toEqual({
            registrarIanaId: '1636',
            registrarName: 'HOSTINGER operations, UAB',
            statuses: ['client transfer prohibited'],
            expiresAt: new Date('2027-02-05T23:59:59.000Z'),
        });
    });

    it('pasa los estados a minúsculas', async () => {
        const { lookup } = setup(json(200, { ...RADIX_RESPONSE, status: ['Client Transfer Prohibited', 'Pending Delete'] }));

        expect((await lookup.lookup(domain))?.statuses).toEqual(['client transfer prohibited', 'pending delete']);
    });

    it('sin registrador ni vencimiento devuelve solo los estados', async () => {
        const { lookup } = setup(json(200, { status: [] }));

        expect(await lookup.lookup(domain)).toEqual({ statuses: [] });
    });

    it('un dominio que el registro no conoce devuelve null', async () => {
        const { lookup } = setup(json(404, { errorCode: 404 }));

        expect(await lookup.lookup(domain)).toBeNull();
    });

    it.each([
        ['un error del registro', json(503, {})],
        ['una respuesta que no es JSON', new Response('<html>', { status: 200 })],
        ['un corte de red', new TypeError('fetch failed')],
    ])('%s se informa como no disponible', async (_name, reply) => {
        const { lookup } = setup(reply);

        await expect(lookup.lookup(domain)).rejects.toThrow(ServiceUnavailableError);
    });

    it('si el registro no contesta a tiempo se informa como no disponible', async () => {
        const { lookup } = setup(
            (signal) =>
                new Promise((_resolve, reject) => {
                    signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
                }),
            10,
        );

        await expect(lookup.lookup(domain)).rejects.toThrow(ServiceUnavailableError);
    });
});
