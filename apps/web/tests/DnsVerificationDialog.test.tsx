import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DomainOwnershipChallengeDto } from '@marketplace/api-contract';
import { DnsVerificationDialogView } from '@/components/DnsVerificationDialog';

/**
 * El diálogo de la comprobación por DNS, sin DOM: se fija qué dice cada estado.
 * El vendedor tiene que poder copiar el registro, saber adónde ir en su
 * proveedor y entender si el sistema lo encontró.
 */

const NETLIFY: DomainOwnershipChallengeDto = {
    domain: 'deliaorrego.online',
    host: '@',
    value: 'traspaso-verificacion=178cd4d4534d977fbdf74f70',
    nameservers: ['dns1.p08.nsone.net'],
    provider: 'netlify',
};
const UNKNOWN: DomainOwnershipChallengeDto = { ...NETLIFY, provider: null };
const SUBDOMAIN: DomainOwnershipChallengeDto = { ...NETLIFY, domain: 'blog.ejemplo.com', host: 'blog.ejemplo.com' };

const adsenseAction = async () => {};

function render(props: Partial<React.ComponentProps<typeof DnsVerificationDialogView>> = {}): string {
    return renderToStaticMarkup(
        <DnsVerificationDialogView
            challenge={NETLIFY}
            status="searching"
            checking={false}
            adsenseAction={adsenseAction}
            {...props}
        />,
    );
}

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

describe('DnsVerificationDialogView: el registro', () => {
    it('muestra tipo, nombre y valor del TXT, y el valor se copia con un clic', () => {
        const html = render();

        expect(texto(html)).toContain('Agregá este registro');
        expect(texto(html)).toContain('Tipo');
        expect(html).toContain('>TXT<');
        expect(texto(html)).toContain('Nombre');
        expect(html).toContain('>@<');
        expect(html).toContain(`aria-label="Copiar el valor del registro: ${NETLIFY.value}"`);
        expect(texto(html)).toContain(NETLIFY.value);
    });

    it('avisa que el TTL se deja como viene', () => {
        expect(texto(render())).toContain('Si te pide TTL, dejá el valor que viene por defecto.');
    });

    it('en la raíz del dominio no explica nada de subdominios', () => {
        expect(texto(render())).not.toContain('Es el nombre completo');
    });

    it('en un subdominio muestra el nombre completo y avisa que algunos paneles agregan el dominio solo, sin calcular la parte', () => {
        const html = render({ challenge: { ...SUBDOMAIN, host: 'shop.tienda.ejemplo.com' } });

        expect(texto(html)).toContain('shop.tienda.ejemplo.com');
        expect(texto(html)).toContain(
            'Es el nombre completo. Si tu panel agrega el dominio solo, poné solo la parte que va antes de él.',
        );
        expect(texto(html)).not.toContain('«shop»');
    });

    it('el paso de la zona nombra el dominio en la raíz y es genérico en un subdominio', () => {
        expect(texto(render({ selectedProvider: 'netlify' }))).toContain('Buscá la sección DNS de deliaorrego.online');
        expect(texto(render({ challenge: SUBDOMAIN, selectedProvider: 'netlify' }))).toContain('Buscá la sección DNS de tu dominio');
        expect(texto(render({ challenge: SUBDOMAIN, selectedProvider: 'netlify' }))).not.toContain('sección DNS de blog.ejemplo.com');
    });
});

describe('DnsVerificationDialogView: el proveedor se elige', () => {
    const NAMES = ['Netlify', 'Hostinger', 'Cloudflare', 'GoDaddy', 'DonWeb', 'Namecheap', 'Amazon Route 53', 'Otro'];

    it('pregunta dónde se maneja el DNS y ofrece los proveedores, en orden', () => {
        const html = render();
        const t = texto(html);

        expect(t).toContain('¿Dónde manejás el DNS de tu dominio?');
        const positions = NAMES.map((name) => t.indexOf(` ${name} `, t.indexOf('¿Dónde manejás')));
        expect(positions.every((p) => p > 0)).toBe(true);
        expect([...positions].sort((x, y) => x - y)).toEqual(positions);
        expect(html.match(/aria-pressed="false"/g)).toHaveLength(8);
    });

    it('nunca preselecciona uno por lo que deduce de los servidores DNS', () => {
        const html = render();

        expect(html).not.toContain('aria-pressed="true"');
        expect(html).not.toContain('target="_blank"');
        expect(texto(html)).toContain('Elegí uno y te mostramos los pasos.');
        expect(texto(html)).not.toContain('Entrá a tu cuenta de');
    });

    it('al elegir uno muestra sus pasos y manda a su panel en una pestaña nueva', () => {
        const html = render({ selectedProvider: 'netlify' });

        expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
        expect(texto(html)).toContain('Entrá a tu cuenta de Netlify.');
        expect(texto(html)).toContain('Abrir Netlify');
        expect(html).toContain('href="https://app.netlify.com/"');
        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="noopener noreferrer"');
    });

    it('«Otro» da pasos genéricos y ningún enlace a un panel', () => {
        const html = render({ selectedProvider: 'other' });

        expect(texto(html)).toContain('Entrá al panel donde administrás el DNS de tu dominio');
        expect(html).not.toContain('target="_blank"');
        expect(texto(html)).not.toContain('Abrir ');
    });

    it('cada proveedor usa su nombre y su panel', () => {
        const html = render({ selectedProvider: 'hostinger' });

        expect(texto(html)).toContain('Abrir Hostinger');
        expect(html).toContain('href="https://hpanel.hostinger.com"');
    });
});

describe('DnsVerificationDialogView: «No sé»', () => {
    it('cerrado, solo ofrece el botón', () => {
        const t = texto(render());

        expect(t).toContain('No sé');
        expect(t).not.toContain('parece que es');
        expect(t).not.toContain('Servidores de nombres');
    });

    it('abierto, dice lo que se deduce de los servidores DNS y ofrece elegirlo', () => {
        const html = render({ unsureOpen: true });
        const t = texto(html);

        expect(t).toContain('Por tus servidores DNS, parece que es Netlify.');
        expect(t).toContain('Es Netlify');
        expect(t).toContain(
            'En general es donde compraste el dominio, salvo que lo hayas apuntado a otro servicio. En el panel donde lo compraste, buscá «DNS» o «Servidores de nombres»: si ahí figura otro servicio, el DNS se maneja allá.',
        );
        expect(html).toContain('aria-expanded="true"');
        // Deducir no es elegir: sigue sin haber nada seleccionado.
        expect(html).not.toContain('aria-pressed="true"');
    });

    it('si no puede deducir el proveedor, lo dice sin ofrecer elegir ninguno', () => {
        const t = texto(render({ challenge: UNKNOWN, unsureOpen: true }));

        expect(t).toContain('No pudimos deducirlo de tus servidores DNS.');
        expect(t).not.toContain('parece que es');
        expect(t).toContain('buscá «DNS» o «Servidores de nombres»');
    });
});

describe('DnsVerificationDialogView: la maqueta', () => {
    it('muestra un panel de DNS genérico escribiendo el valor real del registro', () => {
        const html = render();

        expect(html).toContain('mock-tipeado');
        expect(html).toContain(`--n:${NETLIFY.value.length}`);
        expect(html).toContain('Agregar registro');
        expect(html).toContain('aria-hidden="true"');
        expect(html).toContain('hidden');
    });

    it('no nombra a ningún proveedor', () => {
        const mock = render().match(/<div aria-hidden="true" class="relative h-\[380px\][\s\S]*?mock-cursor-dns[\s\S]*?<\/svg><\/div>/)?.[0] ?? '';

        expect(mock).not.toBe('');
        for (const name of ['Netlify', 'Hostinger', 'Cloudflare', 'GoDaddy', 'DonWeb', 'Namecheap', 'Route 53']) {
            expect(mock).not.toContain(name);
        }
    });
});

describe('DnsVerificationDialogView: por qué lo pedimos', () => {
    it('es un plegable con el motivo, dicho para el vendedor', () => {
        const html = render();

        expect(html).toContain('<details');
        expect(texto(html)).toContain('¿Por qué te pedimos esto?');
        expect(texto(html)).toContain('Podés dejarlo; no afecta tu sitio ni tu mail');
    });
});

describe('DnsVerificationDialogView: el estado', () => {
    it('buscando', () => {
        expect(texto(render({ status: 'searching' }))).toContain('Lo estamos buscando…');
    });

    it('todavía no lo ve: avisa que puede tardar unos minutos', () => {
        expect(texto(render({ status: 'delayed' }))).toContain(
            'Todavía no lo vemos. Los cambios en el DNS pueden tardar unos minutos.',
        );
    });

    it('dejó de buscar: pide avisar cuando esté cargado', () => {
        const html = texto(render({ status: 'stopped' }));

        expect(html).toContain('Dejamos de buscar');
        expect(html).toContain('Ya lo cargué');
    });

    it('verificado', () => {
        expect(texto(render({ status: 'verified' }))).toContain('Listo: comprobamos que el sitio es tuyo.');
    });

    it('error: muestra el motivo', () => {
        const html = render({ status: 'error', error: 'La comprobación por DNS todavía no está disponible.' });

        expect(texto(html)).toContain('La comprobación por DNS todavía no está disponible.');
    });

    it('«Ya lo cargué» consulta ahora y se bloquea mientras consulta', () => {
        expect(render()).toMatch(/<button type="button" class="[^"]*">Ya lo cargué/);
        expect(render({ checking: true })).toMatch(/<button type="button" disabled="" class="[^"]*">Consultando…/);
    });

    it('no tiene el botón si ya está verificado', () => {
        expect(texto(render({ status: 'verified' }))).not.toContain('Ya lo cargué');
    });
});

describe('DnsVerificationDialogView: sin el registro todavía', () => {
    it('mientras se pide, dice que lo prepara y no dibuja el registro', () => {
        const html = render({ challenge: null });

        expect(texto(html)).toContain('Preparando tu registro…');
        expect(texto(html)).not.toContain('Agregá este registro');
    });

    it('si no se pudo pedir, muestra el motivo y sigue ofreciendo AdSense', () => {
        const html = render({ challenge: null, loadError: 'La comprobación por DNS todavía no está disponible.' });

        expect(texto(html)).toContain('La comprobación por DNS todavía no está disponible.');
        expect(texto(html)).toContain('¿Tenés AdSense?');
    });
});

describe('DnsVerificationDialogView: reintentar', () => {
    it('si no se pudo pedir el registro, ofrece «Reintentar»', () => {
        const html = render({ challenge: null, loadError: 'No pudimos consultar tu DNS. Probá de nuevo.', onRetryLoad: () => {} });

        expect(texto(html)).toContain('Reintentar');
    });

    it('mientras se pide el registro no ofrece «Reintentar»', () => {
        expect(texto(render({ challenge: null, onRetryLoad: () => {} }))).not.toContain('Reintentar');
    });
});

describe('DnsVerificationDialogView: AdSense', () => {
    it('es una alternativa secundaria que además verifica los ingresos', () => {
        const html = render();

        expect(texto(html)).toContain('¿Tenés AdSense?');
        expect(texto(html)).toContain('Comprobalo con AdSense, que además verifica tus ingresos');
        expect(html).toContain('<form');
    });
});
