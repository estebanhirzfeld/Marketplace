import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DomainOwnershipChallengeDto } from '@marketplace/api-contract';
import { DnsVerificationDialogView } from '@/components/DnsVerificationDialog';

/**
 * El diálogo de la comprobación por DNS, sin DOM: se fija qué dice cada estado.
 * El vendedor tiene que poder copiar el registro, saber adónde ir en su
 * proveedor y entender si el sistema lo encontró.
 */

const HOSTINGER: DomainOwnershipChallengeDto = {
    domain: 'deliaorrego.online',
    host: '@',
    value: 'traspaso-verificacion=178cd4d4534d977fbdf74f70',
    nameservers: ['dns1.p08.nsone.net'],
    provider: 'hostinger',
};
const UNKNOWN: DomainOwnershipChallengeDto = { ...HOSTINGER, provider: null };
const SUBDOMAIN: DomainOwnershipChallengeDto = { ...HOSTINGER, domain: 'blog.ejemplo.com', host: 'blog.ejemplo.com' };

const adsenseAction = async () => {};

function render(props: Partial<React.ComponentProps<typeof DnsVerificationDialogView>> = {}): string {
    return renderToStaticMarkup(
        <DnsVerificationDialogView
            challenge={HOSTINGER}
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
        expect(html).toContain(`aria-label="Copiar el valor del registro: ${HOSTINGER.value}"`);
        expect(texto(html)).toContain(HOSTINGER.value);
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
        expect(texto(render())).toContain('Abrí la zona DNS de deliaorrego.online');
        expect(texto(render({ challenge: SUBDOMAIN }))).toContain('Abrí la zona DNS de tu dominio');
        expect(texto(render({ challenge: SUBDOMAIN }))).not.toContain('Abrí la zona DNS de blog.ejemplo.com');
    });
});

describe('DnsVerificationDialogView: el proveedor', () => {
    it('con proveedor conocido dice cuál parece y manda a su panel en una pestaña nueva', () => {
        const html = render();

        expect(texto(html)).toContain('Parece que tu DNS está en Hostinger');
        expect(html).toContain('href="https://hpanel.hostinger.com"');
        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="noopener noreferrer"');
    });

    it('con proveedor desconocido da pasos genéricos y ningún enlace a un panel', () => {
        const html = render({ challenge: UNKNOWN });

        expect(texto(html)).toContain('Entrá al panel donde administrás tu dominio');
        expect(texto(html)).not.toContain('Parece que');
        expect(html).not.toContain('target="_blank"');
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
