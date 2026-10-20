import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { HandoverStepDto } from '@marketplace/api-contract';
import { InstructionsModal, stepCounter, moveStep } from '@/components/InstructionsModal';

/**
 * El modal reemplaza una pared de texto: un paso por pantalla, viñetas cortas y
 * enlaces directos a Google. Sin DOM en los tests, se fija lo que se puede leer
 * del marcado; la apertura y el foco los resuelve el elemento <dialog>.
 */

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
}

const PASOS: HandoverStepDto[] = [
    {
        id: '1',
        description: 'El vendedor convierte el canal',
        title: 'Convertí el canal a Cuenta de Marca',
        instruction: 'Convertí el canal.',
        details: ['Creá la cuenta de marca.', 'Elegí "Transferir canal".'],
        links: [
            { label: 'Crear la cuenta de marca', href: 'https://www.youtube.com/channel_switcher' },
            { label: 'Transferir el canal', href: 'https://www.youtube.com/account_advanced' },
        ],
    },
    {
        id: '2',
        description: 'El vendedor sale de los permisos',
        title: 'Salí de los permisos de canal',
        details: ['Entrá a Studio.', 'Quitá tu acceso.'],
        links: [{ label: 'Abrir YouTube Studio', href: 'https://studio.youtube.com' }],
    },
    {
        id: '3',
        description: 'El vendedor promueve',
        title: 'Promovenos a propietario principal',
        details: ['Con el contrato firmado.', 'Google lo rechaza hasta el día 7.'],
        links: [{ label: 'Promover', href: 'https://myaccount.google.com/brandaccounts' }],
        afterPlatformStarts: true,
    },
];

describe('stepCounter', () => {
    it('dice el número de paso y el total', () => {
        expect(stepCounter(0, 4)).toBe('Paso 1 de 4');
        expect(stepCounter(3, 4)).toBe('Paso 4 de 4');
    });
});

describe('moveStep', () => {
    it('avanza y retrocede sin salirse del rango', () => {
        expect(moveStep(0, 1, 3)).toBe(1);
        expect(moveStep(2, 1, 3)).toBe(2);
        expect(moveStep(0, -1, 3)).toBe(0);
        expect(moveStep(2, -1, 3)).toBe(1);
    });
});

describe('InstructionsModal', () => {
    const html = () => renderToStaticMarkup(<InstructionsModal steps={PASOS} />);

    it('ofrece el botón que lo abre', () => {
        expect(texto(html())).toContain('Ver cómo hacerlo');
    });

    it('es un <dialog> modal con título accesible', () => {
        const h = html();

        expect(h).toContain('<dialog');
        expect(h).toMatch(/aria-modal="true"/);
        expect(h).toMatch(/aria-labelledby="([^"]+)"/);
        const id = /aria-labelledby="([^"]+)"/.exec(h)![1];
        expect(h).toContain(`id="${id}"`);
    });

    it('muestra el primer paso con su título, viñetas e indicador', () => {
        const t = texto(html());

        expect(t).toContain('Paso 1 de 3');
        expect(t).toContain('Convertí el canal a Cuenta de Marca');
        expect(t).toContain('Creá la cuenta de marca.');
        expect(t).toContain('Elegí "Transferir canal".');
    });

    it('muestra solo el paso actual', () => {
        const t = texto(html());

        expect(t).not.toContain('Salí de los permisos de canal');
        expect(t).not.toContain('Promovenos a propietario principal');
    });

    it('los enlaces abren en una pestaña nueva sin filtrar el origen', () => {
        const h = html();

        for (const href of ['https://www.youtube.com/channel_switcher', 'https://www.youtube.com/account_advanced']) {
            const a = new RegExp(`<a [^>]*href="${href}"[^>]*>`).exec(h)?.[0];
            expect(a, href).toBeDefined();
            expect(a).toContain('target="_blank"');
            expect(a).toContain('rel="noopener noreferrer"');
        }
        expect(texto(h)).toContain('Crear la cuenta de marca');
    });

    it('en el primer paso Anterior está deshabilitado y Siguiente no', () => {
        const h = html();
        const anterior = /<button[^>]*>\s*Anterior\s*<\/button>/.exec(h)![0];
        const siguiente = /<button[^>]*>\s*Siguiente\s*<\/button>/.exec(h)![0];

        expect(anterior).toMatch(/\sdisabled=""/);
        expect(siguiente).not.toMatch(/\sdisabled=""/);
    });

    it('se cierra con un botón', () => {
        expect(html()).toMatch(/<button[^>]*>\s*Cerrar\s*<\/button>/);
    });

    it('un paso posterior a la firma lo avisa', () => {
        const h = renderToStaticMarkup(<InstructionsModal steps={[PASOS[2]]} />);

        expect(texto(h)).toContain('Más adelante, con el contrato firmado');
    });

    it('sin pasos con detalle no dibuja nada', () => {
        const h = renderToStaticMarkup(
            <InstructionsModal steps={[{ id: '1', description: 'x', instruction: 'y' }]} />,
        );

        expect(h).toBe('');
    });
});
