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

describe('avisos del traslado del dominio a la plataforma', () => {
    const occursAt = '2026-10-28T09:00:00.000Z';
    const delTraslado: NotificationDto = { ...aviso, operationId: 'o1', occursAt };

    it('recuerda que la invitación de Hostinger está por vencer y qué falta', () => {
        const { title, cuerpo } = textFor({ ...delTraslado, type: 'traspaso_recordatorio' });

        expect(title).toBe('Un traslado de dominio está por vencer');
        expect(cuerpo).toBe(`La invitación de Hostinger vence el ${fechaLarga(occursAt)}. Falta confirmar el traslado desde el mail.`);
    });

    it('avisa que la invitación venció y que el vendedor tiene que iniciarlo de nuevo', () => {
        const { title, cuerpo } = textFor({ ...delTraslado, type: 'traspaso_vencido' });

        expect(title).toBe('Venció un traslado de dominio');
        expect(cuerpo).toBe(`La invitación de Hostinger venció el ${fechaLarga(occursAt)}. El vendedor tiene que iniciar el traslado de nuevo.`);
    });

    it('sin fecha, no inventa una', () => {
        expect(textFor({ ...delTraslado, type: 'traspaso_recordatorio', occursAt: undefined }).cuerpo).toBe(
            'La invitación de Hostinger está por vencer. Falta confirmar el traslado desde el mail.',
        );
        expect(textFor({ ...delTraslado, type: 'traspaso_vencido', occursAt: undefined }).cuerpo).toBe(
            'La invitación de Hostinger venció. El vendedor tiene que iniciar el traslado de nuevo.',
        );
    });

    it('avisa que el dominio llegó a la cuenta de la plataforma y falta declarar la custodia', () => {
        const { title, cuerpo } = textFor({ ...delTraslado, type: 'dominio_en_custodia' });

        expect(title).toBe('El dominio ya está en nuestra cuenta');
        expect(cuerpo).toBe('Llegó a la cuenta de Hostinger de la plataforma y la custodia quedó confirmada.');
    });

    it('le recuerda al comprador que acepte el dominio desde su cuenta de Hostinger, con el plazo', () => {
        const { title, cuerpo } = textFor({ ...delTraslado, type: 'entrega_recordatorio' });

        expect(title).toBe('Aceptá el dominio en Hostinger');
        expect(cuerpo).toBe(`La invitación para recibir el dominio vence el ${fechaLarga(occursAt)}. Aceptala desde tu cuenta de Hostinger.`);
        expect(textFor({ ...delTraslado, type: 'entrega_recordatorio', occursAt: undefined }).cuerpo).toBe(
            'Tenés una invitación para recibir el dominio. Aceptala desde tu cuenta de Hostinger.',
        );
    });

    it('le avisa a la plataforma que venció la entrega y que hay que iniciarla de nuevo', () => {
        const { title, cuerpo } = textFor({ ...delTraslado, type: 'entrega_vencida' });

        expect(title).toBe('Venció la entrega de un dominio');
        expect(cuerpo).toBe(`La invitación al comprador venció el ${fechaLarga(occursAt)} sin aceptarse. Hay que volver a iniciar la entrega.`);
        expect(textFor({ ...delTraslado, type: 'entrega_vencida', occursAt: undefined }).cuerpo).toBe(
            'La invitación al comprador venció sin aceptarse. Hay que volver a iniciar la entrega.',
        );
    });

    it('la cesión rechazada le pide al vendedor que mire el motivo y vuelva a ceder', () => {
        const { title, cuerpo } = textFor({ ...delTraslado, type: 'cesion_rechazada' });

        expect(title).toBe('Revisá tu cesión');
        expect(cuerpo).toBe('No nos llegó lo que declaraste haber cedido. En la operación está el motivo; corregilo y declaralo de nuevo.');
        expect(linkFor({ ...delTraslado, type: 'cesion_rechazada' })).toBe('/operaciones/o1');
    });

    it('los tres llevan a la operación', () => {
        for (const type of [
            'traspaso_recordatorio',
            'traspaso_vencido',
            'dominio_en_custodia',
            'entrega_recordatorio',
            'entrega_vencida',
        ] as const) {
            expect(linkFor({ ...delTraslado, type })).toBe('/operaciones/o1');
        }
    });
});
