import { describe, it, expect } from 'vitest';
import { identifyDnsProvider } from '../src/adapters/identifyDnsProvider';

describe('identifyDnsProvider', () => {
    it.each([
        [['dns1.p01.nsone.net', 'dns2.p01.nsone.net'], 'hostinger'],
        [['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'], 'cloudflare'],
        [['ns35.domaincontrol.com', 'ns36.domaincontrol.com'], 'godaddy'],
        [['dns1.registrar-servers.com', 'dns2.registrar-servers.com'], 'namecheap'],
        [['ns-123.awsdns-45.com', 'ns-9.awsdns-01.org'], 'route53'],
        [['ns1.donweb.com', 'ns2.donweb.com'], 'donweb'],
    ])('%j -> %s', (nameservers, expected) => {
        expect(identifyDnsProvider(nameservers)).toBe(expected);
    });

    it('ignora mayúsculas y el punto final', () => {
        expect(identifyDnsProvider(['Ada.NS.Cloudflare.COM.'])).toBe('cloudflare');
    });

    it('devuelve null sin servidores o con servidores desconocidos', () => {
        expect(identifyDnsProvider([])).toBeNull();
        expect(identifyDnsProvider(['ns1.proveedor-desconocido.net'])).toBeNull();
    });

    it('no confunde un dominio que solo termina parecido', () => {
        expect(identifyDnsProvider(['ns1.minsone.net'])).toBeNull();
        expect(identifyDnsProvider(['ns1.notcloudflare.com'])).toBeNull();
    });
});
