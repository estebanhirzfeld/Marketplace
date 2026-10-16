import { describe, it, expect } from 'vitest';
import type { DnsProviderDto } from '@marketplace/api-contract';
import { DNS_PROVIDERS } from '@/lib/dnsProviders';

/**
 * Cada proveedor que la API sabe reconocer tiene que tener nombre y una
 * dirección a su panel: sin ella el paso 2 del diálogo no tendría adónde
 * mandar al vendedor.
 */

const PROVIDERS: DnsProviderDto[] = ['hostinger', 'cloudflare', 'godaddy', 'namecheap', 'route53', 'donweb'];

describe('DNS_PROVIDERS', () => {
    it.each(PROVIDERS)('%s tiene nombre y un panel con https', (provider) => {
        const entry = DNS_PROVIDERS[provider];

        expect(entry.name.length).toBeGreaterThan(0);
        expect(new URL(entry.panelUrl).protocol).toBe('https:');
    });

    it('los nombres se escriben como los escribe cada proveedor', () => {
        expect(DNS_PROVIDERS.hostinger.name).toBe('Hostinger');
        expect(DNS_PROVIDERS.route53.name).toBe('Amazon Route 53');
        expect(DNS_PROVIDERS.godaddy.name).toBe('GoDaddy');
    });
});
