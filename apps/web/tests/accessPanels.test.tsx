import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WhyPopover } from '@/components/WhyPopover';
import { AccessStatusPanel } from '@/components/AccessStatusPanel';
import { SellerLevelGauge } from '@/components/SellerLevelGauge';
import { ACCESS_DIALOG_LINES } from '@/components/AccessInstructionsDialog';
import { DraftPanel } from '@/components/DraftPanel';

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ').replace(/\s+([.,])/g, '$1').trim();
}

describe('WhyPopover', () => {
    it('paso 1: dice por qué una cuenta de marca', () => {
        const html = renderToStaticMarkup(<WhyPopover step={0} />);
        expect(texto(html)).toBe(
            'Google solo deja pasar a otra persona los canales que están en una cuenta de marca. ' +
                'Tus videos, suscriptores y el nombre del canal se mantienen. Seguís siendo el dueño.',
        );
        expect(html).toContain('<strong class="font-semibold text-[var(--color-tinta)]">Seguís siendo el dueño</strong>');
    });

    it('paso 2: dice por qué administrador y qué no podemos', () => {
        const html = renderToStaticMarkup(<WhyPopover step={1} />);
        expect(texto(html)).toBe(
            'Para que el canal pueda pasar al comprador el mismo día que se firma la venta. Google exige 7 días de espera. ' +
                'Con ese rol no podemos borrar tu canal, sacarte a vos ni pasárselo a nadie.',
        );
        expect(html).toContain('>Con ese rol no podemos</strong>');
    });
});

describe('AccessStatusPanel', () => {
    const now = '2026-10-13T12:00:00.000Z';

    it('verificando: avisa que se está revisando la invitación', () => {
        const t = texto(renderToStaticMarkup(<AccessStatusPanel status="verifying" now={now} />));
        expect(t).toContain('Verificando');
        expect(t).toContain('Estamos revisando tu invitación');
    });

    it('en espera: días que faltan y siete segmentos', () => {
        const from = '2026-10-17T12:00:00.000Z';
        const html = renderToStaticMarkup(<AccessStatusPanel status="waiting" transferableFrom={from} now={now} />);
        expect(texto(html)).toContain('4 días para la transferencia inmediata');
        expect(html).toContain('3 de 7 días cumplidos');
        expect((html.match(/h-2 rounded/g) ?? []).length).toBe(7);
    });

    it('promete más visibilidad, no el primer lugar', () => {
        const from = '2026-10-17T12:00:00.000Z';
        const espera = texto(renderToStaticMarkup(<AccessStatusPanel status="waiting" transferableFrom={from} now={now} />));
        const inmediata = texto(renderToStaticMarkup(<AccessStatusPanel status="immediate" now={now} />));

        expect(espera).toContain('tu activo gana más visibilidad en el mercado');
        expect(inmediata).toContain('más visibilidad en el mercado');
        expect(espera + inmediata).not.toMatch(/primero/i);
    });

    it('inmediata: muestra la etiqueta', () => {
        const t = texto(renderToStaticMarkup(<AccessStatusPanel status="immediate" now={now} />));
        expect(t).toContain('TRANSFERENCIA INMEDIATA');
    });
});

describe('SellerLevelGauge', () => {
    it('dice el nivel de 4', () => {
        const html = renderToStaticMarkup(<SellerLevelGauge ownershipVerified accessRegistered />);
        expect(html).toContain('aria-label="Nivel 3 de 4"');
    });

    it('desglosa lo que suma cada logro, con el hecho marcado', () => {
        const html = renderToStaticMarkup(<SellerLevelGauge ownershipVerified accessRegistered={false} />);
        const t = texto(html);
        expect(t).toContain('Titularidad');
        expect(t).toContain('+1');
        expect(t).toContain('Acceso');
        expect(t).toContain('+2');
        expect(t).toContain('Mercado Pago');
        expect(html).toContain('/logos/mercadopago.svg');
        expect(html).toContain('M11 2h7l-4 7h5L8 22l2.5-9H6z');
        expect(html).toContain('aria-label="YouTube"');
        // Solo la titularidad está hecha: un único tilde.
        expect((html.match(/M5 12\.5l4\.5 4\.5L19 7\.5/g) ?? []).length).toBe(1);
    });

    it('sin Mercado Pago disponible omite esa fila y el máximo es 3', () => {
        const html = renderToStaticMarkup(<SellerLevelGauge ownershipVerified accessRegistered mercadoPago="unavailable" />);
        expect(html).not.toContain('/logos/mercadopago.svg');
        expect(html).toContain('aria-label="Nivel 3 de 3"');
    });
});

describe('DraftPanel', () => {
    const noop = async () => ({});
    const props = {
        subject: 'canal',
        sourceLabel: 'YouTube',
        price: 'US$ 1.500',
        kycVerified: true,
        publishAction: noop,
        reviewAction: noop,
        verifyAction: async () => {},
    };

    it('con titularidad: lista para publicar con sus tres tildes', () => {
        const t = texto(renderToStaticMarkup(<DraftPanel {...props} variant="ready" />));
        expect(t).toContain('Listo para publicar');
        expect(t).toContain('Sos el titular del canal');
        expect(t).toContain('Identidad verificada');
        expect(t).toContain('Publicar');
    });

    it('sin titularidad: comprobar es lo principal y la revisión lo secundario', () => {
        const t = texto(renderToStaticMarkup(<DraftPanel {...props} sourceLabel="AdSense" subject="sitio" variant="unverified" />));
        expect(t).toContain('Falta comprobar que el sitio es tuyo');
        expect(t).toContain('Comprobar con AdSense');
        expect(t).toContain('Enviar a revisión');
        expect(t).toContain('Lo revisamos a mano. Tarda más.');
        expect(t).not.toContain('Listo para publicar');
    });

    it('rechazado: solo se puede enviar a revisión', () => {
        const t = texto(
            renderToStaticMarkup(<DraftPanel {...props} variant="rejected" rejectionReason="Faltan datos" />),
        );
        expect(t).toContain('Faltan datos');
        expect(t).toContain('Enviar a revisión');
        expect(t).not.toContain('Comprobar con');
    });
});

describe('AccessInstructionsDialog', () => {
    it('el segundo paso aclara que la cuenta de marca puede tener otro nombre', () => {
        expect(ACCESS_DIALOG_LINES[1][0]).toBe(
            'Elegí la cuenta de marca de tu canal (puede tener otro nombre) y tocá «Administrar permisos».',
        );
    });
});
