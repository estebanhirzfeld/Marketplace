import { describe, it, expect } from 'vitest';
import type { NextActionIdDto, NextStepDto, OperationNextDto } from '@marketplace/api-contract';
import { nextStepCopy } from '@/lib/nextStepCopy';

/*
 * «Tu próximo paso» le dice a cada parte qué le toca o a quién espera, en sus
 * palabras y según lo que se vende. Nunca queda en blanco y nunca le habla de
 * un canal a quien vende un sitio, ni de Hostinger a quien vende un canal.
 */

const DEADLINE = '2026-10-31T12:00:00.000Z';

function next(byRole: OperationNextDto['byRole'], turn: OperationNextDto['turn']): OperationNextDto {
    return { byRole, turn, timeline: [] };
}

const wait = (...waitingOn: ('buyer' | 'seller' | 'platform')[]): NextStepDto => ({ kind: 'wait', waitingOn });

describe('nextStepCopy', () => {
    it('a quien le toca le dice qué hacer y hasta cuándo', () => {
        const n = next(
            { buyer: wait('seller'), seller: { kind: 'act', id: 'declare_handover', blocking: true, deadline: DEADLINE }, platform: wait('seller') },
            ['seller'],
        );

        expect(nextStepCopy(n, 'seller', 'web')).toEqual({
            title: 'Iniciá el traslado del dominio',
            body: 'Seguí los pasos para trasladar el dominio a nuestra cuenta de Hostinger y declaralo acá.',
            deadline: 'Tenés hasta el 31 de octubre de 2026.',
        });
    });

    it('a quien espera le dice a quién, para qué y hasta cuándo', () => {
        const n = next(
            { buyer: wait('seller'), seller: { kind: 'act', id: 'declare_handover', blocking: true, deadline: DEADLINE }, platform: wait('seller') },
            ['seller'],
        );

        expect(nextStepCopy(n, 'platform', 'youtube')).toEqual({
            title: 'Le toca al vendedor: cedernos el control del canal.',
            deadline: 'Tiene hasta el 31 de octubre de 2026.',
        });
    });

    it('la tarea que no traba va como «mientras tanto», después de a quién se espera', () => {
        const n = next(
            {
                buyer: { kind: 'act', id: 'declare_recipient', blocking: false },
                seller: { kind: 'act', id: 'declare_handover', blocking: true },
                platform: wait('seller'),
            },
            ['seller'],
        );

        const copy = nextStepCopy(n, 'buyer', 'web');

        expect(copy.title).toBe('Le toca al vendedor: iniciar el traslado del dominio a nuestra cuenta.');
        expect(copy.meanwhile?.title).toBe('Decinos dónde recibir el dominio');
    });

    it('sin medio de pago, el comprador espera a la plataforma y no se le pide un reclamo', () => {
        const n = next(
            { buyer: wait('platform'), seller: wait('platform'), platform: { kind: 'act', id: 'enable_payment_method', blocking: true } },
            ['platform'],
        );

        const copy = nextStepCopy(n, 'buyer', 'web');

        expect(copy.title).toBe('Le toca a la plataforma: habilitar un medio de pago.');
        expect(JSON.stringify(copy)).not.toMatch(/reclamo/i);
    });

    it('la espera de siete días de un canal dice desde cuándo se puede firmar', () => {
        const all: NextStepDto = { kind: 'wait', waitingOn: ['platform'], deadline: DEADLINE };
        const copy = nextStepCopy(next({ buyer: all, seller: all, platform: all }, []), 'seller', 'youtube');

        expect(copy.title).toBe('La firma se habilita el 31 de octubre de 2026.');
    });

    it('cerrada y cancelada tienen su texto', () => {
        const done: NextStepDto = { kind: 'done' };
        const cancelled: NextStepDto = { kind: 'cancelled' };

        expect(nextStepCopy(next({ buyer: done, seller: done, platform: done }, []), 'buyer').title).toBe('La operación se cerró.');
        expect(nextStepCopy(next({ buyer: cancelled, seller: cancelled, platform: cancelled }, []), 'seller').title).toBe(
            'La operación se canceló.',
        );
    });

    it('con los comprobantes subidos, el vendedor y la plataforma confirman a la vez lo suyo', () => {
        const n = next(
            {
                buyer: wait('seller', 'platform'),
                seller: { kind: 'act', id: 'confirm_seller_receipt', blocking: true, deadline: DEADLINE },
                platform: { kind: 'act', id: 'confirm_commission_receipt', blocking: true },
            },
            ['seller', 'platform'],
        );

        expect(nextStepCopy(n, 'seller', 'web')).toMatchObject({
            title: 'Confirmá que te llegó la transferencia',
            deadline: 'Tenés hasta el 31 de octubre de 2026.',
        });
        expect(nextStepCopy(n, 'platform', 'web').title).toBe('Confirmá la transferencia de la comisión');
        expect(nextStepCopy(n, 'buyer', 'web').title).toBe('Le toca al vendedor: confirmar que le llegó la transferencia.');
    });

    it('sin dónde cobrar, el vendedor lee las dos formas, no solo Mercado Pago', () => {
        const n = next({ buyer: wait('seller'), seller: { kind: 'act', id: 'link_payment_account', blocking: true }, platform: wait('seller') }, ['seller']);

        expect(nextStepCopy(n, 'seller', 'web')).toMatchObject({ title: 'Decinos dónde cobrar' });
        expect(nextStepCopy(n, 'seller', 'web').body).toMatch(/Mercado Pago.*cuenta bancaria/);
        expect(nextStepCopy(n, 'buyer', 'web').title).toBe('Le toca al vendedor: decir dónde cobra.');
    });

    const IDS: NextActionIdDto[] = [
        'respond_offer',
        'sign_contract',
        'register_platform_access',
        'declare_recipient',
        'declare_handover',
        'move_domain_to_platform',
        'verify_custody',
        'pay',
        'enable_payment_method',
        'link_payment_account',
        'confirm_seller_receipt',
        'confirm_commission_receipt',
        'review_receipt',
        'respond_receipt_review',
        'resolve_receipt_review',
        'deliver_asset',
        'accept_delivery',
        'complete_operation',
    ];

    it.each(IDS)('«%s» tiene texto para quien actúa y para quien espera', (id) => {
        const n = next({ buyer: wait('seller'), seller: { kind: 'act', id, blocking: true }, platform: wait('seller') }, ['seller']);

        expect(nextStepCopy(n, 'seller', 'web').title.length).toBeGreaterThan(0);
        expect(nextStepCopy(n, 'buyer', 'web').title).toMatch(/^Le toca al vendedor: .+\.$/);
    });

    // Las acciones que existen en un solo tipo de activo no se prueban del otro.
    const WEB_ONLY: NextActionIdDto[] = ['move_domain_to_platform', 'accept_delivery'];
    const YOUTUBE_ONLY: NextActionIdDto[] = ['register_platform_access'];

    it.each(IDS.filter((id) => !YOUTUBE_ONLY.includes(id)))('«%s» en un sitio no habla de canales', (id) => {
        const n = next({ buyer: wait('seller'), seller: { kind: 'act', id, blocking: true }, platform: wait('seller') }, ['seller']);
        const text = JSON.stringify([nextStepCopy(n, 'seller', 'web'), nextStepCopy(n, 'buyer', 'web')]);

        expect(text).not.toMatch(/canal|YouTube|Google/i);
    });

    it.each(IDS.filter((id) => !WEB_ONLY.includes(id)))('«%s» en un canal no habla de Hostinger ni de dominios', (id) => {
        const n = next({ buyer: wait('seller'), seller: { kind: 'act', id, blocking: true }, platform: wait('seller') }, ['seller']);
        const text = JSON.stringify([nextStepCopy(n, 'seller', 'youtube'), nextStepCopy(n, 'buyer', 'youtube')]);

        expect(text).not.toMatch(/Hostinger|dominio/i);
    });
});
