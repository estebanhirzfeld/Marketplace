import { describe, it, expect } from 'vitest';
import type { NotificationDto } from '@marketplace/api-contract';
import { linkFor, textFor } from '@/lib/notifications';
import { fechaLarga } from '@/lib/format';

const aviso: NotificationDto = {
    id: 'n1',
    type: 'acceso_no_encontrado',
    listingId: 'l1',
    read: false,
    createdAt: new Date().toISOString(),
};

describe('aviso de acceso no encontrado', () => {
    it('le dice al vendedor que revise los pasos y avise de nuevo', () => {
        const { title, cuerpo } = textFor(aviso);

        expect(title).toBe('No encontramos tu invitación');
        expect(cuerpo).toBe('No encontramos tu invitación como administrador. Revisá los pasos y avisanos de nuevo.');
    });

    it('lleva al activo del vendedor', () => {
        expect(linkFor(aviso)).toBe('/activos/l1');
    });
});

describe('aviso de acceso solicitado', () => {
    const solicitado: NotificationDto = { ...aviso, type: 'acceso_solicitado' };

    it('le dice a la plataforma que un vendedor avisó que ya la invitó', () => {
        const { title, cuerpo } = textFor(solicitado);

        expect(title).toBe('Un vendedor ya nos invitó');
        expect(cuerpo).toBe('Avisó que ya nos dio acceso a su activo. Falta verificar el acceso.');
    });

    it('lleva a la bandeja de accesos del panel', () => {
        expect(linkFor(solicitado)).toBe('/admin?bandeja=accesos');
    });
});

describe('aviso de acceso confirmado', () => {
    const occursAt = '2026-10-19T15:00:00.000Z';
    const confirmado: NotificationDto = { ...aviso, type: 'acceso_confirmado', occursAt };

    it('le dice al vendedor desde cuándo su activo es de transferencia inmediata', () => {
        const { title, cuerpo } = textFor(confirmado);

        expect(title).toBe('Confirmamos tu acceso');
        expect(cuerpo).toBe(`El ${fechaLarga(occursAt)} tu activo pasa a transferencia inmediata.`);
    });

    it('sin fecha, no inventa una', () => {
        expect(textFor({ ...confirmado, occursAt: undefined }).cuerpo).toBe('Tu activo pasa a transferencia inmediata.');
    });

    it('lleva a las verificaciones del activo', () => {
        expect(linkFor(confirmado)).toBe('/activos/l1?ver=verificaciones');
    });
});
