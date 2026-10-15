import { describe, it, expect } from 'vitest';
import { NodeDnsResolver } from '../src/adapters/NodeDnsResolver';
import { identifyDnsProvider } from '../src/adapters/identifyDnsProvider';

/**
 * Prueba contra el DNS real. Sale a la red, así que solo corre a pedido:
 * `DNS_LIVE_TEST=1 vitest run tests/NodeDnsResolver.live.test.ts`.
 */
describe.skipIf(!process.env.DNS_LIVE_TEST)('NodeDnsResolver contra el DNS real', { timeout: 60_000 }, () => {
    const resolver = new NodeDnsResolver();

    it('deliaorrego.online publica el TXT de verificación', async () => {
        const records = await resolver.txtRecordsOf('deliaorrego.online');
        console.log('NS:', await resolver.nameserversOf('deliaorrego.online'));
        console.log('TXT:', records);

        expect(records.some((r) => r.startsWith('traspaso-verificacion='))).toBe(true);
    });

    it('reconoce al proveedor por los servidores de nombres', async () => {
        const nameservers = await resolver.nameserversOf('deliaorrego.online');
        expect(identifyDnsProvider(nameservers)).toBe('netlify');
    });

    it('un dominio inexistente da una lista vacía', async () => {
        await expect(resolver.txtRecordsOf('no-existe-este-dominio-xyz-81234.com')).resolves.toEqual([]);
    });
});
