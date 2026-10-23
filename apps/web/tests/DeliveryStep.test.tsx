import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DeliveryStep } from '@/components/DeliveryStep';
import { textFor } from '@/lib/notifications';
import type { NotificationDto } from '@marketplace/api-contract';

/*
 * La entrega de un canal: cada parte confirma lo que hizo con un botón. El
 * comprador, antes de confirmar la recepción, ve qué comprobar y puede
 * reclamar.
 */

async function accion() {
    return {};
}

function texto(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

describe('DeliveryStep', () => {
    it('un paso de la plataforma es un botón con su acción', () => {
        const html = renderToStaticMarkup(<DeliveryStep action={accion} label="Ya lo invité" />);

        expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Ya lo invité<\/button>/);
    });

    it('la recepción muestra qué comprobar y deja reclamar', () => {
        const t = texto(
            renderToStaticMarkup(
                <DeliveryStep
                    action={accion}
                    label="Confirmar la recepción"
                    checks={['Sos propietario principal del canal.', 'El vendedor ya no figura en los permisos.']}
                    claimHref="#reclamo"
                />,
            ),
        );

        expect(t).toContain('Sos propietario principal del canal.');
        expect(t).toContain('El vendedor ya no figura en los permisos.');
        expect(t).toContain('Confirmar la recepción');
        expect(t).toContain('Tengo un problema');
    });
});

describe('aviso de la recepción', () => {
    it('es cierto para las dos partes, haya confirmado el comprador o se haya dado por recibido', () => {
        const aviso: NotificationDto = { id: 'n1', type: 'activo_recibido', operationId: 'op', read: false, createdAt: '2026-11-10T12:00:00.000Z' };
        const { title, cuerpo } = textFor(aviso);

        expect(title).toBe('Recepción confirmada');
        expect(cuerpo).not.toContain('El comprador confirmó');
        expect(cuerpo).toContain('La operación se cerrará');
    });
});
