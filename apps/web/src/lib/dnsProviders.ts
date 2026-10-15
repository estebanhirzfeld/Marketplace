import type { DnsProviderDto } from '@marketplace/api-contract';

/**
 * Los proveedores de DNS que la API reconoce, con el nombre que usa cada uno y
 * la entrada a su panel. Son direcciones de entrada (el inicio de sesión o el
 * tablero), no páginas profundas: las páginas profundas cambian de lugar y un
 * enlace roto en medio del trámite es peor que uno que obliga a un clic más.
 */
export const DNS_PROVIDERS: Record<DnsProviderDto, { name: string; panelUrl: string }> = {
    hostinger: { name: 'Hostinger', panelUrl: 'https://hpanel.hostinger.com' },
    cloudflare: { name: 'Cloudflare', panelUrl: 'https://dash.cloudflare.com' },
    godaddy: { name: 'GoDaddy', panelUrl: 'https://dcc.godaddy.com' },
    namecheap: { name: 'Namecheap', panelUrl: 'https://ap.www.namecheap.com' },
    route53: { name: 'Amazon Route 53', panelUrl: 'https://console.aws.amazon.com/route53' },
    donweb: { name: 'DonWeb', panelUrl: 'https://micuenta.donweb.com' },
};
