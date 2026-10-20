import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DomainOwnershipChallengeDto } from '@marketplace/api-contract';
import { DnsVerificationDialogView } from '@/components/DnsVerificationDialog';

/**
 * El diálogo de la comprobación por DNS, sin DOM: se fija qué dice cada pantalla.
 * El vendedor tiene que poder elegir dónde maneja su DNS, copiar el registro,
 * saber adónde ir en su proveedor y entender si el sistema lo encontró.
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
const publishAction = async () => ({});

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

const NAMES = ['Netlify', 'Hostinger', 'Cloudflare', 'GoDaddy', 'DonWeb', 'Namecheap', 'Amazon Route 53', 'Otro'];

describe('DnsVerificationDialogView: el encabezado', () => {
    it('titula el diálogo y cuenta los pasos', () => {
        expect(texto(render())).toContain('Comprobá que el sitio es tuyo');
        expect(texto(render())).toContain('1 / 2');
        expect(texto(render({ step: 'record', selectedProvider: 'netlify' }))).toContain('2 / 2');
    });

    it('en la vista final dice si está buscando o si ya terminó', () => {
        expect(texto(render({ step: 'result', selectedProvider: 'netlify' }))).toContain('Buscando');
        expect(texto(render({ step: 'result', selectedProvider: 'netlify', status: 'verified' }))).toContain('Listo');
    });

    it('tiene su botón de cerrar', () => {
        expect(render()).toContain('aria-label="Cerrar"');
    });
});

describe('DnsVerificationDialogView: paso 1, la pregunta', () => {
    it('al empezar muestra solo la pregunta centrada, las ocho opciones y «No sé»', () => {
        const html = render();
        const t = texto(html);

        expect(html).toContain('data-layout="centered"');
        expect(t).toContain('¿Dónde manejás el DNS de tu dominio?');
        const positions = NAMES.map((name) => t.indexOf(` ${name} `, t.indexOf('¿Dónde manejás')));
        expect(positions.every((p) => p > 0)).toBe(true);
        expect([...positions].sort((x, y) => x - y)).toEqual(positions);
        expect(html.match(/role="radio"/g)).toHaveLength(8);
        expect(html).not.toContain('aria-checked="true"');
        expect(t).toContain('No sé');
        expect(t).not.toContain('Vas a cargarlo');
        expect(t).not.toContain('Agregá este registro');
    });

    it('las opciones van en una grilla de cuatro por dos', () => {
        expect(render()).toContain('sm:grid-cols-4');
    });

    it('nunca preselecciona uno por lo que deduce de los servidores DNS', () => {
        const html = render();

        expect(html).not.toContain('aria-checked="true"');
        expect(html).not.toContain('target="_blank"');
        expect(texto(html)).not.toContain('parece que es');
    });

    it('«Siguiente →» no se puede apretar hasta elegir, y «← Anterior» tampoco al empezar', () => {
        const html = render();

        expect(html).toMatch(/<button type="button" disabled="" class="[^"]*">← Anterior/);
        expect(html).toMatch(/<button type="button" disabled="" class="[^"]*">Siguiente →/);
    });
});

describe('DnsVerificationDialogView: paso 1, ya con una opción', () => {
    it('las opciones pasan a una columna a la izquierda y entra el panel con los pasos', () => {
        const html = render({ selectedProvider: 'netlify' });
        const t = texto(html);

        expect(html).toContain('data-layout="split"');
        expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
        expect(t).toContain('Vas a cargarlo en Netlify');
        expect(t).toContain('Entrá a Netlify y buscá la sección DNS de deliaorrego.online.');
        expect(t).toContain('Agregá un registro nuevo de tipo TXT.');
        expect(t).toContain('Pegá el nombre y el valor, y guardá.');
    });

    it('las opciones no se animan al cambiar de lugar: solo el panel entra con un fundido', () => {
        const html = render({ selectedProvider: 'netlify' });
        const options = html.match(/<button[^>]*role="radio"[^>]*>/g) ?? [];

        expect(options).toHaveLength(8);
        for (const option of options) {
            expect(option).not.toMatch(/transition|duration|animate/);
        }
        expect(html).toContain('dns-panel-in');
    });

    it('«Siguiente →» se habilita al elegir', () => {
        const html = render({ selectedProvider: 'netlify' });

        expect(html).not.toMatch(/<button type="button" disabled="" class="[^"]*">Siguiente →/);
        expect(html).toMatch(/<button type="button" class="[^"]*">Siguiente →/);
    });

    it('en un subdominio el paso de la zona es genérico', () => {
        const t = texto(render({ challenge: SUBDOMAIN, selectedProvider: 'netlify' }));

        expect(t).toContain('buscá la sección DNS de tu dominio');
        expect(t).not.toContain('sección DNS de blog.ejemplo.com');
    });

    it('«Otro» da pasos genéricos y ningún enlace a un panel', () => {
        const html = render({ selectedProvider: 'other' });

        expect(texto(html)).toContain('Vas a cargarlo en el panel de tu dominio');
        expect(texto(html)).toContain('Entrá al panel donde administrás el DNS de tu dominio');
        expect(html).not.toContain('target="_blank"');
        expect(texto(html)).not.toContain('Abrir ');
    });

    it('cada proveedor nombra su panel', () => {
        const html = render({ selectedProvider: 'hostinger' });

        expect(texto(html)).toContain('Vas a cargarlo en Hostinger');
        expect(texto(html)).toContain('Entrá a Hostinger y buscá la sección DNS');
        expect(texto(html)).not.toContain('Vas a cargarlo en Netlify');
    });
});

describe('DnsVerificationDialogView: «No sé»', () => {
    it('elige el proveedor que se deduce, lo dice y explica cómo averiguarlo', () => {
        const html = render({ selectedProvider: 'netlify', unsure: true });
        const t = texto(html);

        expect(t).toContain('Por tus servidores DNS, parece que es Netlify.');
        expect(t).toContain(
            'En general es donde compraste el dominio, salvo que lo hayas apuntado a otro servicio. En el panel donde lo compraste, buscá «DNS» o «Servidores de nombres»: si ahí figura otro servicio, el DNS se maneja allá.',
        );
        expect(t).toContain('Vas a cargarlo en Netlify');
        expect(html).toContain('data-layout="split"');
        // «No sé» marca el proveedor deducido, igual que si lo hubiera elegido.
        expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
        expect(html).toContain('aria-pressed="true"');
    });

    it('si no puede deducirlo, lo dice, explica cómo averiguarlo y no elige nada', () => {
        const html = render({ challenge: UNKNOWN, selectedProvider: null, unsure: true });
        const t = texto(html);

        expect(t).toContain('No pudimos deducirlo de tus servidores DNS.');
        expect(t).not.toContain('parece que es');
        expect(t).toContain('buscá «DNS» o «Servidores de nombres»');
        expect(t).not.toContain('Vas a cargarlo');
        expect(html).toContain('data-layout="split"');
        expect(html).not.toContain('aria-checked="true"');
        expect(html).toMatch(/<button type="button" disabled="" class="[^"]*">Siguiente →/);
    });

    it('sin tocarlo no muestra nada de esto', () => {
        const t = texto(render());

        expect(t).not.toContain('parece que es');
        expect(t).not.toContain('Servidores de nombres');
    });
});

describe('DnsVerificationDialogView: paso 2, el registro', () => {
    const record = { step: 'record', selectedProvider: 'netlify' } as const;

    it('muestra tipo, nombre y valor del TXT, y el valor se copia con un clic', () => {
        const html = render(record);
        const t = texto(html);

        expect(t).toContain('Agregá este registro en Netlify');
        expect(t).toContain('Tipo');
        expect(html).toContain('>TXT<');
        expect(t).toContain('Nombre');
        expect(html).toContain('>@<');
        expect(html).toContain(`aria-label="Copiar el valor del registro: ${NETLIFY.value}"`);
        expect(t).toContain(NETLIFY.value);
    });

    it('ya no muestra la pregunta ni las opciones', () => {
        const html = render(record);

        expect(html).not.toContain('role="radio"');
        expect(texto(html)).not.toContain('¿Dónde manejás');
    });

    it('avisa que el TTL se deja como viene', () => {
        expect(texto(render(record))).toContain('Si te pide TTL, dejá el valor que viene por defecto.');
    });

    it('manda al panel del proveedor en una pestaña nueva', () => {
        const html = render(record);

        expect(texto(html)).toContain('Abrir Netlify');
        expect(html).toContain('href="https://app.netlify.com/"');
        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="noopener noreferrer"');
    });

    it('con «Otro» no hay enlace y el título es genérico', () => {
        const html = render({ step: 'record', selectedProvider: 'other' });

        expect(texto(html)).toContain('Agregá este registro en el panel de tu dominio');
        expect(html).not.toContain('target="_blank"');
    });

    it('en la raíz del dominio no explica nada de subdominios', () => {
        expect(texto(render(record))).not.toContain('Es el nombre completo');
    });

    it('en un subdominio muestra el nombre completo y avisa que algunos paneles agregan el dominio solo', () => {
        const t = texto(render({ ...record, challenge: { ...SUBDOMAIN, host: 'shop.tienda.ejemplo.com' } }));

        expect(t).toContain('shop.tienda.ejemplo.com');
        expect(t).toContain(
            'Es el nombre completo. Si tu panel agrega el dominio solo, poné solo la parte que va antes de él.',
        );
        expect(t).not.toContain('«shop»');
    });

    it('explica por qué lo pedimos, en un plegable', () => {
        const html = render(record);

        expect(html).toContain('<details');
        expect(texto(html)).toContain('¿Por qué te pedimos esto?');
        expect(texto(html)).toContain('Podés dejarlo; no afecta tu sitio ni tu mail');
    });

    it('sigue ofreciendo AdSense como alternativa, que además verifica los ingresos', () => {
        const html = render(record);

        expect(texto(html)).toContain('¿Tenés AdSense?');
        expect(texto(html)).toContain('Comprobalo con AdSense, que además verifica tus ingresos');
        expect(html).toContain('<form');
    });

    it('«Ya lo cargué» pasa a la vista final', () => {
        expect(render(record)).toMatch(/<button type="button" class="[^"]*">Ya lo cargué/);
    });

    it('muestra un panel de DNS genérico escribiendo el valor real del registro', () => {
        const html = render(record);

        expect(html).toContain('mock-tipeado');
        expect(html).toContain(`--n:${NETLIFY.value.length}`);
        expect(html).toContain('Agregar registro');
        expect(html).toContain('hidden');
    });

    it('la maqueta no nombra a ningún proveedor', () => {
        const mock =
            render({ step: 'record', selectedProvider: 'other' }).match(
                /<div aria-hidden="true" class="relative h-\[380px\][\s\S]*?mock-cursor-dns[\s\S]*?<\/svg><\/div>/,
            )?.[0] ?? '';

        expect(mock).not.toBe('');
        for (const name of ['Netlify', 'Hostinger', 'Cloudflare', 'GoDaddy', 'DonWeb', 'Namecheap', 'Route 53']) {
            expect(mock).not.toContain(name);
        }
    });
});

describe('DnsVerificationDialogView: vista final', () => {
    const result = { step: 'result', selectedProvider: 'netlify' } as const;

    it('buscando: gira un indicador y la lista dice qué ya está hecho y qué falta', () => {
        const html = render(result);
        const t = texto(html);

        expect(t).toContain('Lo estamos buscando…');
        expect(html).toContain('animate-spin');
        expect(html).toContain('motion-reduce:animate-none');
        expect(t).toContain('Registro generado para deliaorrego.online');
        expect(t).toContain('Servidores DNS encontrados: Netlify');
        expect(t).toContain('Buscando el registro TXT…');
        expect(t).not.toContain('Registro TXT encontrado');
    });

    it('sin proveedor elegido la lista dice «tu proveedor»', () => {
        expect(texto(render({ step: 'result', selectedProvider: 'other' }))).toContain(
            'Servidores DNS encontrados: tu proveedor',
        );
        expect(texto(render({ step: 'result', selectedProvider: null }))).toContain(
            'Servidores DNS encontrados: tu proveedor',
        );
    });

    it('todavía no lo ve: avisa que puede tardar unos minutos', () => {
        expect(texto(render({ ...result, status: 'delayed' }))).toContain(
            'Todavía no lo vemos. Los cambios en el DNS pueden tardar unos minutos.',
        );
    });

    it('dejó de buscar: pide volver a buscar cuando esté cargado', () => {
        const t = texto(render({ ...result, status: 'stopped' }));

        expect(t).toContain('Dejamos de buscar');
        expect(t).toContain('Cuando lo hayas cargado, tocá «Buscar de nuevo».');
        expect(t).not.toContain('Buscando el registro TXT…');
    });

    it('error: muestra el motivo y deja reintentar', () => {
        const html = render({ ...result, status: 'error', error: 'La comprobación por DNS todavía no está disponible.' });

        expect(texto(html)).toContain('La comprobación por DNS todavía no está disponible.');
        expect(html).not.toContain('animate-spin');
        expect(html).toMatch(/<button type="button" class="[^"]*">Buscar de nuevo/);
    });

    it('«Buscar de nuevo» consulta ahora y se bloquea mientras consulta', () => {
        expect(render(result)).toMatch(/<button type="button" class="[^"]*">Buscar de nuevo/);
        expect(render({ ...result, checking: true })).toMatch(
            /<button type="button" disabled="" class="[^"]*">Consultando…/,
        );
    });

    it('«← Anterior» vuelve al registro', () => {
        expect(render(result)).toMatch(/<button type="button" class="[^"]*">← Anterior/);
    });

    it('verificado: lo dice, tilda el registro y ofrece publicar', () => {
        const html = render({ ...result, status: 'verified', publishAction });
        const t = texto(html);

        expect(t).toContain('Listo: comprobamos que el sitio es tuyo');
        expect(t).toContain('Registro TXT encontrado');
        expect(t).not.toContain('Buscando el registro TXT…');
        expect(t).not.toContain('Buscar de nuevo');
        expect(html).not.toContain('animate-spin');
        expect(html).toContain('<form');
        expect(t).toContain('Publicar');
    });

    it('verificado y sin nada que publicar: se cierra desde un botón', () => {
        const t = texto(render({ ...result, status: 'verified' }));

        expect(t).not.toContain('Publicar');
        expect(t).toContain('Cerrar');
    });
});

describe('DnsVerificationDialogView: sin el registro todavía', () => {
    it('mientras se pide, dice que lo prepara y no dibuja ni opciones ni pasos', () => {
        const html = render({ challenge: null });

        expect(texto(html)).toContain('Preparando tu registro…');
        expect(html).not.toContain('role="radio"');
        expect(html).not.toContain('Siguiente →');
    });

    it('si no se pudo pedir, muestra el motivo y sigue ofreciendo AdSense', () => {
        const html = render({ challenge: null, loadError: 'La comprobación por DNS todavía no está disponible.' });

        expect(texto(html)).toContain('La comprobación por DNS todavía no está disponible.');
        expect(texto(html)).toContain('¿Tenés AdSense?');
    });

    it('si no se pudo pedir el registro, ofrece «Reintentar»', () => {
        const html = render({ challenge: null, loadError: 'No pudimos consultar tu DNS. Probá de nuevo.', onRetryLoad: () => {} });

        expect(texto(html)).toContain('Reintentar');
    });

    it('mientras se pide el registro no ofrece «Reintentar»', () => {
        expect(texto(render({ challenge: null, onRetryLoad: () => {} }))).not.toContain('Reintentar');
    });
});
