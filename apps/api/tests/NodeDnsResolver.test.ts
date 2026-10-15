import { describe, it, expect, vi } from 'vitest';
import { ServiceUnavailableError } from '@marketplace/domain/src/errors/DomainError';
import { NodeDnsResolver, DnsLookup } from '../src/adapters/NodeDnsResolver';

/**
 * Sin red: el resolvedor recibe una fábrica de consultas y acá se la
 * reemplaza por una tabla. Se prueba qué servidores se consultan y cómo se
 * traducen los errores, que es lo que decide el resultado.
 */

const PUBLIC_SERVERS = ['1.1.1.1', '8.8.8.8'];

function dnsError(code: string): Error {
    return Object.assign(new Error(`query ${code}`), { code });
}

interface Fake {
    ns?: Record<string, string[] | Error>;
    a?: Record<string, string[] | Error>;
    txt?: Record<string, string[][] | Error>;
}

function fakeLookup(fake: Fake, onTxt?: () => void): DnsLookup {
    const answer = <T>(table: Record<string, T | Error> | undefined, name: string): T => {
        const value = table?.[name];
        if (value === undefined) throw dnsError('ENODATA');
        if (value instanceof Error) throw value;
        return value;
    };
    return {
        resolveNs: async (name) => answer(fake.ns, name),
        resolve4: async (name) => answer(fake.a, name),
        resolveTxt: async (name) => {
            onTxt?.();
            return answer(fake.txt, name);
        },
    };
}

function build(publicFake: Fake, authoritativeFake: Fake = {}) {
    const calls: string[][] = [];
    const resolver = new NodeDnsResolver((servers) => {
        calls.push(servers);
        return servers.join() === PUBLIC_SERVERS.join() ? fakeLookup(publicFake) : fakeLookup(authoritativeFake);
    });
    return { resolver, calls };
}

describe('NodeDnsResolver.nameserversOf', () => {
    it('devuelve los servidores de nombres desde el resolvedor público', async () => {
        const { resolver, calls } = build({ ns: { 'ejemplo.com': ['a.ns.test', 'b.ns.test'] } });

        await expect(resolver.nameserversOf('ejemplo.com')).resolves.toEqual(['a.ns.test', 'b.ns.test']);
        expect(calls).toEqual([PUBLIC_SERVERS]);
    });

    it.each(['ENOTFOUND', 'ENODATA'])('%s es una respuesta vacía, no un error', async (code) => {
        const { resolver } = build({ ns: { 'ejemplo.com': dnsError(code) } });

        await expect(resolver.nameserversOf('ejemplo.com')).resolves.toEqual([]);
    });

    it.each(['ETIMEOUT', 'ECONNREFUSED', 'ESERVFAIL'])('%s se informa como servicio no disponible', async (code) => {
        const { resolver } = build({ ns: { 'ejemplo.com': dnsError(code) } });

        await expect(resolver.nameserversOf('ejemplo.com')).rejects.toBeInstanceOf(ServiceUnavailableError);
    });
});

describe('NodeDnsResolver.txtRecordsOf', () => {
    const zone = {
        ns: { 'ejemplo.com': ['ns1.prov.test'] },
        a: { 'ns1.prov.test': ['203.0.113.7'] },
    };

    it('consulta el TXT en los servidores autoritativos y une los fragmentos de cada registro', async () => {
        const { resolver, calls } = build(zone, {
            txt: { 'ejemplo.com': [['traspaso-verificacion=', 'abc123'], ['v=spf1 -all']] },
        });

        await expect(resolver.txtRecordsOf('ejemplo.com')).resolves.toEqual([
            'traspaso-verificacion=abc123',
            'v=spf1 -all',
        ]);
        expect(calls).toContainEqual(['203.0.113.7']);
    });

    it('en un subdominio sube al padre hasta encontrar los servidores de nombres', async () => {
        const { resolver, calls } = build(
            {
                ns: { 'ejemplo.com': ['ns1.prov.test'] },
                a: { 'ns1.prov.test': ['203.0.113.7'] },
            },
            { txt: { 'blog.ejemplo.com': [['hola']] } },
        );

        await expect(resolver.txtRecordsOf('blog.ejemplo.com')).resolves.toEqual(['hola']);
        expect(calls).toContainEqual(['203.0.113.7']);
    });

    it('no sube hasta la extensión sola', async () => {
        const queried: string[] = [];
        const resolver = new NodeDnsResolver(() => ({
            resolveNs: async (name) => {
                queried.push(name);
                throw dnsError('ENODATA');
            },
            resolve4: async () => [],
            resolveTxt: async () => [['x']],
        }));

        await resolver.txtRecordsOf('a.ejemplo.com');

        expect(queried).toEqual(['a.ejemplo.com', 'ejemplo.com']);
    });

    it('ENOTFOUND o ENODATA en el TXT es una lista vacía', async () => {
        for (const code of ['ENOTFOUND', 'ENODATA']) {
            const { resolver } = build(zone, { txt: { 'ejemplo.com': dnsError(code) } });
            await expect(resolver.txtRecordsOf('ejemplo.com')).resolves.toEqual([]);
        }
    });

    it('si no se pueden determinar los servidores autoritativos usa el resolvedor público', async () => {
        const { resolver, calls } = build({ txt: { 'ejemplo.com': [['desde-publico']] } });

        await expect(resolver.txtRecordsOf('ejemplo.com')).resolves.toEqual(['desde-publico']);
        expect(calls.every((c) => c.join() === PUBLIC_SERVERS.join())).toBe(true);
    });

    it('si los servidores autoritativos no responden usa el resolvedor público', async () => {
        const { resolver } = build(
            { ...zone, txt: { 'ejemplo.com': [['desde-publico']] } },
            { txt: { 'ejemplo.com': dnsError('ETIMEOUT') } },
        );

        await expect(resolver.txtRecordsOf('ejemplo.com')).resolves.toEqual(['desde-publico']);
    });

    it('si tampoco responde el público informa servicio no disponible', async () => {
        const { resolver } = build(
            { ...zone, txt: { 'ejemplo.com': dnsError('ETIMEOUT') } },
            { txt: { 'ejemplo.com': dnsError('ETIMEOUT') } },
        );

        await expect(resolver.txtRecordsOf('ejemplo.com')).rejects.toBeInstanceOf(ServiceUnavailableError);
    });

    it('no pierde el error original en el mensaje', async () => {
        const resolver = new NodeDnsResolver(() => ({
            resolveNs: vi.fn(async () => {
                throw dnsError('ETIMEOUT');
            }),
            resolve4: vi.fn(async () => []),
            resolveTxt: vi.fn(async () => {
                throw dnsError('ETIMEOUT');
            }),
        }));

        await expect(resolver.txtRecordsOf('ejemplo.com')).rejects.toThrow(/DNS/);
    });

    it.each([['10.0.0.5'], ['169.254.169.254'], ['127.0.0.1'], ['192.168.0.9']])(
        'no consulta a un servidor autoritativo privado (%s) y usa el resolvedor público',
        async (privateIp) => {
            const { resolver, calls } = build(
                { ns: { 'ejemplo.com': ['ns1.prov.test'] }, a: { 'ns1.prov.test': [privateIp] }, txt: { 'ejemplo.com': [['desde-publico']] } },
                { txt: { 'ejemplo.com': [['desde-privado']] } },
            );

            await expect(resolver.txtRecordsOf('ejemplo.com')).resolves.toEqual(['desde-publico']);
            expect(calls.flat()).not.toContain(privateIp);
            expect(calls.every((c) => c.join() === PUBLIC_SERVERS.join())).toBe(true);
        },
    );

    it('en una lista mixta conserva solo las direcciones públicas', async () => {
        const { resolver, calls } = build(
            {
                ns: { 'ejemplo.com': ['ns1.prov.test', 'ns2.prov.test'] },
                a: { 'ns1.prov.test': ['10.0.0.5', '203.0.113.7'], 'ns2.prov.test': ['169.254.169.254', '198.51.100.9'] },
            },
            { txt: { 'ejemplo.com': [['ok']] } },
        );

        await expect(resolver.txtRecordsOf('ejemplo.com')).resolves.toEqual(['ok']);
        expect(calls).toContainEqual(['203.0.113.7', '198.51.100.9']);
        expect(calls.flat()).not.toContain('10.0.0.5');
        expect(calls.flat()).not.toContain('169.254.169.254');
    });
});

describe('NodeDnsResolver — plazo total', () => {
    const hanging = (): DnsLookup => ({
        resolveNs: () => new Promise<string[]>(() => {}),
        resolve4: () => new Promise<string[]>(() => {}),
        resolveTxt: () => new Promise<string[][]>(() => {}),
    });

    it('nameserversOf falla con ServiceUnavailableError al vencer el plazo', async () => {
        const resolver = new NodeDnsResolver(hanging, { deadlineMs: 30 });

        await expect(resolver.nameserversOf('ejemplo.com')).rejects.toBeInstanceOf(ServiceUnavailableError);
    });

    it('txtRecordsOf falla con ServiceUnavailableError al vencer el plazo', async () => {
        const resolver = new NodeDnsResolver(hanging, { deadlineMs: 30 });

        await expect(resolver.txtRecordsOf('ejemplo.com')).rejects.toBeInstanceOf(ServiceUnavailableError);
    });

    it('una respuesta a tiempo no se ve afectada por el plazo', async () => {
        const resolver = new NodeDnsResolver(() => fakeLookup({ ns: { 'ejemplo.com': ['a.ns.test'] } }), { deadlineMs: 1_000 });

        await expect(resolver.nameserversOf('ejemplo.com')).resolves.toEqual(['a.ns.test']);
    });
});
