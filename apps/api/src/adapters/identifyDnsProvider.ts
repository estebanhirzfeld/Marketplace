import type { DnsProviderDto } from '@marketplace/api-contract';

/** Sufijo del nombre de un servidor de nombres → proveedor que lo opera. */
const PROVIDERS: ReadonlyArray<readonly [suffix: string, provider: DnsProviderDto]> = [
    // NS1 es el DNS de Netlify (netlify.app delega en p01.nsone.net). Hostinger
    // tiene servidores propios: dns-parking.com (tutorial de Hostinger).
    ['nsone.net', 'netlify'],
    ['dns-parking.com', 'hostinger'],
    ['cloudflare.com', 'cloudflare'],
    ['domaincontrol.com', 'godaddy'],
    ['registrar-servers.com', 'namecheap'],
    ['donweb.com', 'donweb'],
];

/** Los de Route 53 llevan `awsdns-NN` en una etiqueta, bajo varias extensiones. */
const ROUTE53 = /(^|\.)ns-\d+\.awsdns-\d+\.[a-z.]+$/;

function normalize(nameserver: string): string {
    return nameserver.trim().toLowerCase().replace(/\.$/, '');
}

/**
 * Deduce el proveedor de DNS a partir de los servidores de nombres del dominio,
 * para que la pantalla muestre las instrucciones de ese panel. Compara por
 * sufijo de etiqueta completa: `minsone.net` no es `nsone.net`.
 *
 * `null` cuando ninguno es de un proveedor conocido.
 */
export function identifyDnsProvider(nameservers: string[]): DnsProviderDto | null {
    for (const raw of nameservers) {
        const host = normalize(raw);

        if (ROUTE53.test(host)) return 'route53';

        for (const [suffix, provider] of PROVIDERS) {
            if (host === suffix || host.endsWith(`.${suffix}`)) return provider;
        }
    }
    return null;
}
