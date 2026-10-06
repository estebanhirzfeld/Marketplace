import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiError } from '@marketplace/api-client';
import { UserRole } from '@marketplace/shared-types';
import { MercadoPagoPanel } from '@/components/MercadoPagoPanel';
import { UnlinkMercadoPagoButton } from '@/components/UnlinkMercadoPagoButton';

/**
 * Una vendedora entra a esta tarjeta una vez, antes de publicar, a hacer una
 * sola cosa: vincular su cuenta de cobro. Los tests fijan que cada estado diga
 * lo que corresponde, que nunca haya un botón que no lleve a ningún lado y que
 * no se filtre vocabulario del sistema.
 */

const paymentAccountStatus = vi.fn();
vi.mock('@/lib/api', () => ({ api: () => ({ paymentAccountStatus }) }));
vi.mock('@/app/perfil/actions', () => ({
    startMercadoPagoLink: async () => {},
    unlinkMercadoPagoAccount: async () => ({}),
}));

import { MercadoPagoSection } from '@/components/MercadoPagoSection';

async function accion() {}
async function accionConEstado(state: { error?: string; ok?: boolean }) {
    return state;
}

const VINCULADA = {
    linked: true as const,
    mpUserId: '123',
    linkedAt: '2026-10-01T00:00:00.000Z',
    expiresAt: '2026-12-01T00:00:00.000Z',
    expired: false,
};

function panel(
    status: React.ComponentProps<typeof MercadoPagoPanel>['status'],
    result?: React.ComponentProps<typeof MercadoPagoPanel>['result'],
) {
    return renderToStaticMarkup(
        <MercadoPagoPanel
            status={status}
            result={result}
            startAction={accion}
            unlinkAction={accionConEstado}
        />,
    );
}

const VOCABULARIO_INTERNO = /oauth|token|pkce|\bstate\b|\bapi\b|gateway|split|\b503\b|INVALID_STATE/i;

describe('MercadoPagoPanel', () => {
    it('sin vincular invita a vincular con un solo botón', () => {
        const html = panel({ linked: false });

        expect(html).toContain('id="mercadopago"');
        expect(html).toContain('Vincular Mercado Pago');
        expect(html).not.toContain('Desvincular');
    });

    it('vinculada lo dice y ofrece desvincular sin destacarlo', () => {
        const html = panel(VINCULADA);

        expect(html).toContain('VINCULADA');
        expect(html).toContain('Desvincular');
        expect(html).not.toContain('Vincular Mercado Pago');
        expect(html).not.toContain('Vincular de nuevo');
    });

    it('con el permiso vencido pide vincular de nuevo', () => {
        const html = panel({ ...VINCULADA, expired: true });

        expect(html).toContain('Vincular de nuevo');
        expect(html).toMatch(/venci/i);
        expect(html).not.toContain('VINCULADA');
    });

    it('sin la integración configurada lo dice y no deja un botón muerto', () => {
        const html = panel('unavailable');

        expect(html).toMatch(/todavía no está disponible/i);
        expect(html).not.toMatch(/<button/);
        expect(html).not.toMatch(/<form/);
    });

    it('si la acción avisó que no está disponible tampoco muestra el botón', () => {
        const html = panel({ linked: false }, 'no-disponible');

        expect(html).toMatch(/todavía no está disponible/i);
        expect(html).not.toMatch(/<button/);
    });

    it('tras un intento fallido cuenta que no salió y deja volver a probar', () => {
        const html = panel({ linked: false }, 'error');

        expect(html).toMatch(/no pudimos vincular/i);
        expect(html).toContain('Vincular Mercado Pago');
    });

    it('tras vincular con éxito lo confirma', () => {
        const html = panel(VINCULADA, 'vinculada');

        expect(html).toMatch(/listo/i);
        expect(html).toContain('VINCULADA');
    });

    it('un aviso de éxito no se muestra si la cuenta no quedó vinculada', () => {
        const html = panel({ linked: false }, 'vinculada');

        expect(html).not.toMatch(/listo/i);
    });

    it('ningún estado usa vocabulario del sistema', () => {
        const estados = [
            panel({ linked: false }),
            panel(VINCULADA),
            panel({ ...VINCULADA, expired: true }),
            panel('unavailable'),
            panel({ linked: false }, 'error'),
            panel(VINCULADA, 'vinculada'),
            panel({ linked: false }, 'no-disponible'),
        ];

        for (const html of estados) {
            expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(VOCABULARIO_INTERNO);
        }
    });
});

describe('UnlinkMercadoPagoButton', () => {
    it('al principio solo ofrece desvincular, sin confirmar nada', () => {
        const html = renderToStaticMarkup(<UnlinkMercadoPagoButton action={accionConEstado} />);

        expect(html).toContain('Desvincular');
        expect(html).not.toContain('Confirmar');
    });

    it('al confirmar explica qué cambia y pide confirmar o volver', () => {
        const html = renderToStaticMarkup(
            <UnlinkMercadoPagoButton action={accionConEstado} initiallyConfirming />,
        );

        expect(html).toMatch(/no vas a poder publicar/i);
        expect(html).toContain('Confirmar');
        expect(html).toContain('Volver');
    });
});

describe('MercadoPagoSection', () => {
    beforeEach(() => {
        paymentAccountStatus.mockReset();
    });

    async function seccion(role: string, result?: 'error') {
        const element = await MercadoPagoSection({ role, result });
        return element ? renderToStaticMarkup(element) : '';
    }

    it('el admin no ve el panel y ni siquiera se consulta el estado', async () => {
        const html = await seccion(UserRole.ADMIN);

        expect(html).toBe('');
        expect(paymentAccountStatus).not.toHaveBeenCalled();
    });

    it('un vendedor ve su estado real', async () => {
        paymentAccountStatus.mockResolvedValue(VINCULADA);

        expect(await seccion(UserRole.SELLER)).toContain('VINCULADA');
    });

    it('con la integración sin configurar (503) muestra que no está disponible', async () => {
        paymentAccountStatus.mockRejectedValue(new ApiError('INTERNAL', 'sin configurar', 503));

        const html = await seccion(UserRole.SELLER);

        expect(html).toMatch(/todavía no está disponible/i);
        expect(html).not.toMatch(/<button/);
    });

    it('ante cualquier otra falla de la API no rompe la pantalla', async () => {
        paymentAccountStatus.mockRejectedValue(new Error('boom'));

        const html = await seccion(UserRole.SELLER);

        expect(html).toMatch(/todavía no está disponible/i);
    });
});
